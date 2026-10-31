package com.erp.accounting.tax.paymentstatement;

import com.erp.accounting.tax.paymentstatement.dto.PaymentStatementDtos.FileRequest;
import com.erp.accounting.tax.paymentstatement.dto.PaymentStatementDtos.FileResponse;
import com.erp.common.ApiException;
import com.erp.common.history.ChangeHistoryService;
import com.erp.common.history.dto.ChangeHistoryDtos.ChangeHistoryResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;

/**
 * 지급명세서파일생성(세무 › 원천징수 › 지급명세서 E030503, 2026-10-14 loginaa 실측).
 *
 * <p>목록은 귀속연월 내림차순(원본 2026.09 · 2026.08 · 2026.04 · 2026.03 · 2025.12 · 2025.12 · 2025.12 · 2025.04,
 * 같은 달은 자료구분 차례 — 일괄생성 · 근로소득 · 거주자 기타소득). 조건 귀속연도 from ~ to, 자료구분(일괄생성 = 전체).
 * 같은 자료구분 · 귀속연월은 두 번 못 만든다('이미 생성된 자료입니다.'). 수정은 자료구분 · 귀속연월이 잠긴다.
 * 이 줄은 간이지급명세서 · 소득자료제출집계표 숫자에 닿지 않는다(원본 2026.09 거주자 사업소득을 만들어도 간이 목록 그대로).
 */
@Service
@RequiredArgsConstructor
public class PaymentStatementService {

    /** 공용 [H] 이력의 대상 글자 */
    public static final String HISTORY_TARGET = "PAYMENT_STATEMENT_FILE";
    static final String DUPLICATE = "이미 생성된 자료입니다.";

    private final PaymentStatementFileRepository repository;
    private final ChangeHistoryService changeHistory;

    /** kind 가 null 이거나 일괄생성이면 모든 자료구분 — 원본 조건 [자료구분] 기본 '일괄생성' 이 모두를 보였다. */
    @Transactional(readOnly = true)
    public List<FileResponse> list(int fromYear, int toYear, PaymentStatementKind kind) {
        return repository.findByAttrYearBetween(Math.min(fromYear, toYear), Math.max(fromYear, toYear)).stream()
                .filter(f -> kind == null || kind == PaymentStatementKind.BATCH || f.getKind() == kind)
                .sorted(Comparator.comparing(PaymentStatementFile::getAttrYear).reversed()
                        .thenComparing(PaymentStatementFile::getAttrMonth, Comparator.reverseOrder())
                        .thenComparing(PaymentStatementFile::getKind)
                        .thenComparing(PaymentStatementFile::getId))
                .map(PaymentStatementService::toResponse).toList();
    }

    @Transactional
    public FileResponse create(FileRequest req) {
        checkMonth(req.attrMonth());
        if (repository.existsByKindAndAttrYearAndAttrMonth(req.kind(), req.attrYear(), req.attrMonth())) {
            throw ApiException.badRequest(DUPLICATE);
        }
        PaymentStatementFile f = PaymentStatementFile.builder()
                .kind(req.kind()).attrYear(req.attrYear()).attrMonth(req.attrMonth()).build();
        apply(f, req);
        f = repository.save(f);
        changeHistory.record(HISTORY_TARGET, f.getId(), ChangeHistoryService.CREATED);
        return toResponse(f);
    }

    /** 원본 수정 창은 자료구분 · 귀속연월이 잠긴다 — 신고일자 · 꼬리표 · 담당자 · 제출자만 바뀐다. */
    @Transactional
    public FileResponse update(Long id, FileRequest req) {
        PaymentStatementFile f = repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("지급명세서파일을 찾을 수 없습니다."));
        if (req.kind() != f.getKind() || !req.attrYear().equals(f.getAttrYear()) || !req.attrMonth().equals(f.getAttrMonth())) {
            throw ApiException.badRequest("자료구분 · 귀속연월은 바꿀 수 없습니다.");
        }
        apply(f, req);
        changeHistory.record(HISTORY_TARGET, f.getId(), ChangeHistoryService.UPDATED);
        return toResponse(f);
    }

    @Transactional
    public void delete(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            throw ApiException.badRequest("리스트에 선택된 자료가 없습니다. 체크박스에 체크한 후 다시 시도 바랍니다.");
        }
        repository.deleteAllById(ids);
    }

    /** 원본 '지급명세서전자파일 이력보기' — 순번 · 작업자ID · 작업일시 · 상태(신고서종류는 화면이 자료구분을 붙인다). */
    @Transactional(readOnly = true)
    public List<ChangeHistoryResponse> history(Long id) {
        PaymentStatementFile f = repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("지급명세서파일을 찾을 수 없습니다."));
        return changeHistory.list(HISTORY_TARGET, id, null, f.getCreatedAt());
    }

    private static void checkMonth(Integer month) {
        if (month == null || month < 1 || month > 12) throw ApiException.badRequest("귀속연월이 올바르지 않습니다.");
    }

    private static void apply(PaymentStatementFile f, FileRequest req) {
        f.setReportDate(req.reportDate());
        f.setMidSettlement(req.midSettlement());
        f.setBasis(req.basis());
        f.setOtherIncome(req.otherIncome());
        f.setManagerDept(req.managerDept().trim());
        f.setManagerName(req.managerName().trim());
        f.setManagerPhone(req.managerPhone().trim());
        f.setSubmitter(req.submitter());
    }

    private static FileResponse toResponse(PaymentStatementFile f) {
        return new FileResponse(f.getId(), f.getKind(), f.getKind().getDisplayName(), f.getAttrYear(), f.getAttrMonth(),
                f.getReportDate(), Boolean.TRUE.equals(f.getMidSettlement()), f.getBasis(), f.getOtherIncome(),
                f.getManagerDept(), f.getManagerName(), f.getManagerPhone(), f.getSubmitter());
    }
}
