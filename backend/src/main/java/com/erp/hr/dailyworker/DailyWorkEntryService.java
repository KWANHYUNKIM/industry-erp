package com.erp.hr.dailyworker;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.hr.dailyworker.dto.DailyWorkEntryDtos.EntryLine;
import com.erp.hr.dailyworker.dto.DailyWorkEntryDtos.LineResponse;
import com.erp.hr.dailyworker.dto.DailyWorkEntryDtos.SaveSlipRequest;
import com.erp.hr.dailyworker.dto.DailyWorkEntryDtos.SlipResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

/** 일용근로 근무입력 · 근무조회(원본 E020138 · E020751). */
@Service
@RequiredArgsConstructor
public class DailyWorkEntryService {

    private final DailyWorkEntryRepository repository;
    private final DailyWorkerRepository workerRepository;
    private final DocumentNoGenerator documentNoGenerator;

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
    public SlipResponse create(SaveSlipRequest req) {
        documentNoGenerator.lockNumberSpace("DAILYWORK" + req.slipDate());
        int slipNo = repository.maxSlipNo(req.slipDate()) + 1;
        saveLines(req.slipDate(), slipNo, req.lines());
        return findSlip(req.slipDate(), slipNo);
    }

    @Transactional
    public SlipResponse update(LocalDate slipDate, int slipNo, SaveSlipRequest req) {
        findSlip(slipDate, slipNo);
        repository.deleteSlip(slipDate, slipNo);
        repository.flush();
        saveLines(slipDate, slipNo, req.lines());
        return findSlip(slipDate, slipNo);
    }

    /** 근무조회 [선택삭제] — '삭제하시겠습니까?' */
    @Transactional
    public void delete(LocalDate slipDate, int slipNo) {
        findSlip(slipDate, slipNo);
        repository.deleteSlip(slipDate, slipNo);
    }

    private void saveLines(LocalDate slipDate, int slipNo, List<EntryLine> lines) {
        int n = 0;
        for (EntryLine in : lines) {
            DailyWorker w = workerRepository.findById(in.workerId())
                    .orElseThrow(() -> ApiException.notFound("일용근로 사원을 찾을 수 없습니다."));
            repository.save(DailyWorkEntry.builder()
                    .slipDate(slipDate).slipNo(slipNo).lineNo(++n)
                    .workDate(in.workDate()).worker(w).quantity(in.quantity()).amount(in.amount())
                    .build());
        }
    }
}
