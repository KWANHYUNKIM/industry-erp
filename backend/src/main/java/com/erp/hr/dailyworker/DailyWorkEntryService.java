package com.erp.hr.dailyworker;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.hr.dailypayitem.DailyPayItem;
import com.erp.hr.dailypayitem.DailyPayItemKind;
import com.erp.hr.dailypayitem.DailyPayItemRepository;
import com.erp.hr.dailyworker.dto.DailyWorkEntryDtos.EntryLine;
import com.erp.hr.dailyworker.dto.DailyWorkEntryDtos.HistoryLine;
import com.erp.hr.dailyworker.dto.DailyWorkEntryDtos.HistoryRow;
import com.erp.hr.dailyworker.dto.DailyWorkEntryDtos.LineResponse;
import com.erp.hr.dailyworker.dto.DailyWorkEntryDtos.SaveSlipRequest;
import com.erp.hr.dailyworker.dto.DailyWorkEntryDtos.SlipResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/** 일용근로 근무입력 · 근무조회(원본 E020138 · E020751). */
@Service
@RequiredArgsConstructor
public class DailyWorkEntryService {

    private final DailyWorkEntryRepository repository;
    private final DailyWorkerRepository workerRepository;
    private final DocumentNoGenerator documentNoGenerator;
    private final DailyPayItemRepository payItemRepository;
    private final DailyWorkEntryHistoryRepository historyRepository;

    /** 근무조회 — 전표일자 기간의 줄(원본은 줄마다 한 행). */
    @Transactional(readOnly = true)
    public List<LineResponse> findLines(LocalDate from, LocalDate to) {
        return repository.findInPeriod(from, to).stream().map(LineResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public SlipResponse findSlip(LocalDate slipDate, int slipNo) {
        List<DailyWorkEntry> lines = repository.findSlip(slipDate, slipNo);
        if (lines.isEmpty()) throw ApiException.notFound("근무 전표를 찾을 수 없습니다: " + slipDate + " -" + slipNo);
        return new SlipResponse(slipDate, slipNo, lines.stream().map(LineResponse::from).toList());
    }

    @Transactional
    public SlipResponse create(SaveSlipRequest req, String worker) {
        int slipNo = documentNoGenerator.nextSeq("daily_work_entries", req.slipDate(), repository.maxSlipNo(req.slipDate()));
        saveLines(req.slipDate(), slipNo, req.lines());
        SlipResponse saved = findSlip(req.slipDate(), slipNo);
        record(saved, "신규", worker);
        return saved;
    }

    @Transactional
    public SlipResponse update(LocalDate slipDate, int slipNo, SaveSlipRequest req, String worker) {
        findSlip(slipDate, slipNo);
        repository.deleteSlip(slipDate, slipNo);
        repository.flush();
        saveLines(slipDate, slipNo, req.lines());
        SlipResponse saved = findSlip(slipDate, slipNo);
        record(saved, "수정", worker);
        return saved;
    }

    /** 근무조회 [선택삭제] — '삭제하시겠습니까?' */
    @Transactional
    public void delete(LocalDate slipDate, int slipNo, String worker) {
        SlipResponse before = findSlip(slipDate, slipNo);
        repository.deleteSlip(slipDate, slipNo);
        record(before, "삭제", worker);
    }

    /** 근무조회 [이력] — 작업일자 구간의 이력, 최신순(지운 전표도 '삭제' 로 남는다). */
    @Transactional(readOnly = true)
    public List<HistoryRow> findHistories(LocalDate from, LocalDate to) {
        return historyRepository.findByActedAtBetweenOrderByActedAtDescIdDesc(from.atStartOfDay(), to.plusDays(1).atStartOfDay().minusNanos(1))
                .stream().map(HistoryRow::from).toList();
    }

    /** H 창 — 한 전표의 이력, 오래된 것부터. */
    @Transactional(readOnly = true)
    public List<HistoryRow> findSlipHistory(LocalDate slipDate, int slipNo) {
        return historyRepository.findBySlipDateAndSlipNoOrderByActedAtAscIdAsc(slipDate, slipNo).stream().map(HistoryRow::from).toList();
    }

    private void record(SlipResponse slip, String action, String worker) {
        LineResponse first = slip.lines().get(0);
        String who = first.workerName() + (slip.lines().size() > 1 ? " 외 " + (slip.lines().size() - 1) + "건" : "");
        BigDecimal qty = slip.lines().stream().map(LineResponse::quantity).reduce(BigDecimal.ZERO, BigDecimal::add);
        historyRepository.save(DailyWorkEntryHistory.builder()
                .slipDate(slip.slipDate()).slipNo(slip.slipNo()).action(action)
                .employeeName(who).payItemName(first.payItem()).quantity(qty)
                .worker(worker == null ? "" : worker).actedAt(LocalDateTime.now())
                .linesJson(HistoryRow.writeLines(slip.lines().stream().map(HistoryLine::from).toList()))
                .build());
    }

    private void saveLines(LocalDate slipDate, int slipNo, List<EntryLine> lines) {
        int n = 0;
        for (EntryLine in : lines) {
            DailyWorker w = workerRepository.findById(in.workerId())
                    .orElseThrow(() -> ApiException.notFound("일용근로 사원을 찾을 수 없습니다."));
            DailyPayItem item = null;
            if (in.payItemId() != null) {
                item = payItemRepository.findById(in.payItemId())
                        .filter(x -> x.getKind() == DailyPayItemKind.ALLOWANCE)
                        .orElseThrow(() -> ApiException.notFound("수당항목을 찾을 수 없습니다."));
                if (item.isBuiltin()) item = null;   // 기본 일근무는 비워 둔다(옛 줄과 같게)
            }
            repository.save(DailyWorkEntry.builder()
                    .slipDate(slipDate).slipNo(slipNo).lineNo(++n)
                    .workDate(in.workDate()).worker(w).payItem(item).quantity(in.quantity()).amount(in.amount())
                    .build());
        }
    }
}
