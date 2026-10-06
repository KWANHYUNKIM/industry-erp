package com.erp.hr.workrecord;

import com.erp.common.ApiException;
import com.erp.hr.employee.EmployeeService;
import com.erp.hr.payroll.PaySettingService;
import com.erp.hr.workrecord.dto.WorkRecordDtos.LineInput;
import com.erp.hr.workrecord.dto.WorkRecordDtos.LineResponse;
import com.erp.hr.workrecord.dto.WorkRecordDtos.SaveSlipRequest;
import com.erp.hr.workrecord.dto.WorkRecordDtos.SlipResponse;
import com.erp.common.DocumentNoGenerator;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;

/**
 * 근무입력 · 근무조회(E090113 · E090105). 급여계산이 변동수당을 셈할 때 {@link #sumByItem} 을 부른다.
 */
@Service
@RequiredArgsConstructor
public class WorkRecordService {

    private final WorkRecordRepository repository;
    private final WorkConfirmRepository confirmRepository;
    private final EmployeeService employeeService;
    private final PaySettingService paySettingService;
    private final DocumentNoGenerator documentNoGenerator;

    /** 근무조회 — 기간 안의 전표를 최신순으로. */
    @Transactional(readOnly = true)
    public List<SlipResponse> findSlips(LocalDate from, LocalDate to) {
        Map<String, List<WorkRecord>> bySlip = new LinkedHashMap<>();
        for (WorkRecord w : repository.findInPeriod(from, to)) {
            bySlip.computeIfAbsent(w.getSlipDate() + "#" + w.getSlipNo(), k -> new ArrayList<>()).add(w);
        }
        return bySlip.values().stream().map(this::toSlip).toList();
    }

    @Transactional(readOnly = true)
    public SlipResponse findSlip(LocalDate slipDate, int slipNo) {
        List<WorkRecord> lines = repository.findSlip(slipDate, slipNo);
        if (lines.isEmpty()) throw ApiException.notFound("근무 전표를 찾을 수 없습니다: " + slipDate + " -" + slipNo);
        return toSlip(lines);
    }

    /** 근무입력 [저장] — 새 전표(그 일자의 다음 번호). */
    @Transactional
    public SlipResponse create(SaveSlipRequest req) {
        documentNoGenerator.lockNumberSpace("WORKREC" + req.slipDate());
        int slipNo = repository.maxSlipNo(req.slipDate()) + 1;
        saveLines(req.slipDate(), slipNo, req.lines());
        return findSlip(req.slipDate(), slipNo);
    }

    /** 전표 수정 — 줄을 통째로 바꾼다. */
    @Transactional
    public SlipResponse update(LocalDate slipDate, int slipNo, SaveSlipRequest req) {
        findSlip(slipDate, slipNo);
        repository.deleteBySlipDateAndSlipNo(slipDate, slipNo);
        repository.flush();
        saveLines(slipDate, slipNo, req.lines());
        return findSlip(slipDate, slipNo);
    }

    /** 근무조회 [선택삭제]. */
    @Transactional
    public void delete(LocalDate slipDate, int slipNo) {
        findSlip(slipDate, slipNo);
        repository.deleteBySlipDateAndSlipNo(slipDate, slipNo);
    }

    /** 근무확정현황 · 근무기록확정 창: 귀속월 구간의 확정값. */
    @Transactional(readOnly = true)
    public List<com.erp.hr.workrecord.dto.WorkRecordDtos.ConfirmRow> findConfirms(String from, String to) {
        return confirmRepository.findInMonths(from, to).stream().map(c -> new com.erp.hr.workrecord.dto.WorkRecordDtos.ConfirmRow(
                c.getPayMonth(), c.getEmployee().getId(), c.getEmployee().getCode(), c.getEmployee().getName(),
                c.getPayItem().getId(), c.getPayItem().getName(), c.getPayItem().getPayMethod().getDisplayName(),
                c.getQuantity())).toList();
    }

    /**
     * 원본 근무기록확정 창의 [근무기록] — 근무입력에서 그 귀속월 근무일자의 기록을 사원 · 항목별로 더해 내놓는다.
     * 저장하지 않는다(창에 채워 보여 주고, 사람이 고쳐서 [저장]한다).
     */
    @Transactional(readOnly = true)
    public List<com.erp.hr.workrecord.dto.WorkRecordDtos.ConfirmRow> loadFromRecords(String payMonth) {
        java.time.YearMonth ym = java.time.YearMonth.parse(payMonth);
        Map<String, com.erp.hr.workrecord.dto.WorkRecordDtos.ConfirmRow> acc = new LinkedHashMap<>();
        for (WorkRecord w : repository.findInWorkPeriod(ym.atDay(1), ym.atEndOfMonth())) {
            String k = w.getEmployee().getId() + "#" + w.getPayItem().getId();
            var prev = acc.get(k);
            BigDecimal q = (prev == null ? BigDecimal.ZERO : prev.quantity()).add(w.getQuantity());
            acc.put(k, new com.erp.hr.workrecord.dto.WorkRecordDtos.ConfirmRow(payMonth,
                    w.getEmployee().getId(), w.getEmployee().getCode(), w.getEmployee().getName(),
                    w.getPayItem().getId(), w.getPayItem().getName(), w.getPayItem().getPayMethod().getDisplayName(), q));
        }
        return List.copyOf(acc.values());
    }

    /** 근무기록확정 [저장] — 그 귀속월 확정값을 통째로 바꾼다. 0 인 칸은 넣지 않는다. */
    @Transactional
    public List<com.erp.hr.workrecord.dto.WorkRecordDtos.ConfirmRow> saveConfirms(
            String payMonth, List<com.erp.hr.workrecord.dto.WorkRecordDtos.ConfirmCell> cells) {
        confirmRepository.deleteByPayMonth(payMonth);
        confirmRepository.flush();
        for (var c : cells) {
            if (c.quantity() == null || c.quantity().signum() == 0) continue;
            confirmRepository.save(WorkConfirm.builder()
                    .payMonth(payMonth)
                    .employee(employeeService.get(c.employeeId()))
                    .payItem(paySettingService.item(c.payItemId()))
                    .quantity(c.quantity())
                    .build());
        }
        return findConfirms(payMonth, payMonth);
    }

    /** 근무기록확정 [삭제]. */
    @Transactional
    public void deleteConfirms(String payMonth) {
        confirmRepository.deleteByPayMonth(payMonth);
    }

    /** 급여계산용: 그 귀속월에 확정한 근무기록을 수당항목 id 별로. */
    @Transactional(readOnly = true)
    public Map<Long, BigDecimal> confirmedByItem(Long employeeId, String payMonth) {
        Map<Long, BigDecimal> out = new HashMap<>();
        for (WorkConfirm c : confirmRepository.findFor(payMonth, employeeId)) out.merge(c.getPayItem().getId(), c.getQuantity(), BigDecimal::add);
        return out;
    }

    /** 급여계산용: 그 사원의 기간 근무기록을 수당항목 id 별로 더한다. */
    @Transactional(readOnly = true)
    public Map<Long, BigDecimal> sumByItem(Long employeeId, LocalDate from, LocalDate to) {
        Map<Long, BigDecimal> out = new HashMap<>();
        for (Object[] r : repository.sumByItem(employeeId, from, to)) out.put((Long) r[0], (BigDecimal) r[1]);
        return out;
    }

    private void saveLines(LocalDate slipDate, int slipNo, List<LineInput> lines) {
        int n = 0;
        for (LineInput in : lines) {
            repository.save(WorkRecord.builder()
                    .slipDate(slipDate).slipNo(slipNo).lineNo(++n)
                    .workDate(in.workDate())
                    .employee(employeeService.get(in.employeeId()))
                    .payItem(paySettingService.item(in.payItemId()))
                    .quantity(in.quantity())
                    .build());
        }
    }

    private SlipResponse toSlip(List<WorkRecord> lines) {
        WorkRecord first = lines.get(0);
        int more = lines.size() - 1;
        String emp = first.getEmployee().getName() + (more > 0 ? " 외 " + more + "건" : "");
        BigDecimal qty = lines.stream().map(WorkRecord::getQuantity).reduce(BigDecimal.ZERO, BigDecimal::add);
        return new SlipResponse(first.getSlipDate(), first.getSlipNo(), emp, first.getPayItem().getName(), qty,
                lines.stream().map(LineResponse::from).toList());
    }
}
