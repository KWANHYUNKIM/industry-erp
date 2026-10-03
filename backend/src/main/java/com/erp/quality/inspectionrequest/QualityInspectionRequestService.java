package com.erp.quality.inspectionrequest;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.inventory.item.Item;
import com.erp.quality.inspectionrequest.dto.QualityRequestDtos.RequestLineReq;
import java.math.BigDecimal;
import com.erp.quality.inspectionrequest.dto.QualityRequestDtos.CreateRequestReq;
import com.erp.quality.inspectionrequest.dto.QualityRequestDtos.RequestResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

@Service
@RequiredArgsConstructor
public class QualityInspectionRequestService {

    private final QualityInspectionRequestRepository requestRepository;
    /* 예전엔 inventory 의 리포지토리를 바로 주입했다 — 그 모듈의 service 를 거친다(CLAUDE.md 4.2). */
    private final com.erp.inventory.item.ItemService itemService;
    private final com.erp.quality.inspection.QualityInspectionRepository inspectionRepository;
    private final com.erp.inventory.project.ProjectService projectService;
    private final DocumentNoGenerator docNoGenerator;

    /** status가 null이면 전체, 아니면 해당 상태만(미검사현황=REQUESTED). */
    @Transactional(readOnly = true)
    public List<RequestResponse> findAll(QualityRequestStatus status) {
        return findAll(status, null, null);
    }

    /**
     * 화면 조건 판의 <b>[기간]</b>. 예전에는 물어보지도 않고 전 기간을 통째로 주었다.
     * 안 주면 <b>넓은 경계</b>로 채운다 — <code>:from is null or …</code> 는 42P18 로 터진다.
     */
    @Transactional(readOnly = true)
    public List<RequestResponse> findAll(QualityRequestStatus status,
                                         java.time.LocalDate from, java.time.LocalDate to) {
        List<QualityInspectionRequest> rows = status != null
                ? requestRepository.findByStatusWithRefs(status)
                : requestRepository.findAllWithRefs(
                from != null ? from : java.time.LocalDate.of(1900, 1, 1),
                to != null ? to : java.time.LocalDate.of(9999, 12, 31));
        java.util.Map<Long, List<com.erp.quality.inspection.QualityInspection>> linked = linkedBy(rows);
        return rows.stream().map(r -> RequestResponse.from(r, linked.getOrDefault(r.getId(), List.of()))).toList();
    }

    /**
     * 품질검사요청 저장 — 원본 품질검사요청입력(E040628)처럼 품목 줄을 든 전표다(2026-10-04 실측).
     * 줄이 없으면 옛 모양(품목 하나 · 요청수량)을 줄 하나로 바꿔 받는다 — 구매 · 판매 입력이 이것으로 낸다.
     */
    @Transactional
    public RequestResponse create(CreateRequestReq req, String username) {
        LocalDate date = req.requestDate() != null ? req.requestDate() : LocalDate.now();
        String requester = (req.requester() != null && !req.requester().isBlank()) ? req.requester() : username;
        QualityInspectionRequest r = QualityInspectionRequest.builder()
                .requestNo(generateNo(date))
                .requestDate(date)
                .type(req.type() != null ? req.type() : com.erp.quality.inspection.QualityInspectionType.INCOMING)
                .status(QualityRequestStatus.REQUESTED)
                .requester(requester)
                .build();
        applyContent(r, req);
        return RequestResponse.from(requestRepository.save(r));
    }

    /** 수정 — 줄을 통째로 바꾼다. 일자는 그대로(번호가 일자를 문다). */
    @Transactional
    public RequestResponse update(Long id, CreateRequestReq req) {
        QualityInspectionRequest r = getRequest(id);
        if (req.type() != null) r.setType(req.type());
        if (req.requester() != null && !req.requester().isBlank()) r.setRequester(req.requester());
        applyContent(r, req);
        requestRepository.flush();
        refreshStatus(r);
        return RequestResponse.from(r, inspectionRepository.findByRequestIds(List.of(r.getId())));
    }

    private void applyContent(QualityInspectionRequest r, CreateRequestReq req) {
        /*
         * 원본 실측: 검사방법은 <b>전수 · 샘플링</b> 둘이고, 샘플링이면 옆에 비율을 적는다.
         * 샘플링이라면서 비율이 없으면 <b>몇 개를 보라는 말인지 알 수 없다</b> — 막는다(옛 모양의 머리 칸).
         */
        String method = blankToNull(req.inspectMethod());
        if (method != null && !"전수".equals(method) && !"샘플링".equals(method)) {
            throw ApiException.badRequest("검사방법은 전수 · 샘플링 중 하나여야 합니다: " + method);
        }
        if ("샘플링".equals(method)
                && (req.samplePercent() == null || req.samplePercent().signum() <= 0)) {
            throw ApiException.badRequest("샘플링 검사는 비율(%)을 0보다 크게 적어야 합니다.");
        }
        List<RequestLineReq> lines = req.lines() != null && !req.lines().isEmpty() ? req.lines() : legacyLine(req, method);
        if (lines.isEmpty()) throw ApiException.badRequest("자료를 입력 바랍니다.");

        r.getLines().clear();
        requestRepository.flush();
        int no = 1;
        BigDecimal total = BigDecimal.ZERO;
        for (RequestLineReq lr : lines) {
            r.getLines().add(QualityInspectionRequestLine.builder()
                    .request(r).lineNo(no++).item(itemService.get(lr.itemId()))
                    .method(lr.method() != null ? lr.method() : com.erp.quality.inspection.InspectionMethod.FULL)
                    .quantity(lr.quantity()).build());
            total = total.add(lr.quantity());
        }
        /* 머리는 줄에서 모은 값 — 미검사현황 · 요청현황이 이것을 읽는다. */
        r.setItem(r.getLines().get(0).getItem());
        r.setRequestQty(total);
        r.setLotNo(req.lotNo());
        r.setDueDate(req.dueDate());
        /* 다른 모듈의 것은 그 모듈 service 를 거쳐 얻는다(CLAUDE.md 4.2). */
        r.setProject(req.projectId() != null ? projectService.get(req.projectId()) : null);
        r.setInspectMethod(method != null ? method
                : r.getLines().get(0).getMethod().getDisplayName());
        /* 전수에는 비율이 없다 — 다 보는데 비율을 적으면 무엇을 뜻하는지 알 수 없다. */
        r.setSamplePercent("샘플링".equals(method) ? req.samplePercent() : null);
        r.setRemark(req.remark());
    }

    private static List<RequestLineReq> legacyLine(CreateRequestReq req, String method) {
        if (req.itemId() == null) return List.of();
        if (req.requestQty() == null) throw ApiException.badRequest("요청수량을 입력하세요.");
        return List.of(new RequestLineReq(req.itemId(),
                "샘플링".equals(method) ? com.erp.quality.inspection.InspectionMethod.SAMPLING
                        : com.erp.quality.inspection.InspectionMethod.FULL,
                req.requestQty()));
    }

    /**
     * 이어진 검사로 [종결여부] 를 다시 본다 — 검사한 수량이 요청 수량에 닿으면 완료, 아니면 진행중.
     * 품질검사를 저장 · 수정 · 삭제할 때마다 부른다. 취소한 요청은 건드리지 않는다.
     */
    @Transactional
    public void refreshStatus(QualityInspectionRequest r) {
        if (r.getStatus() == QualityRequestStatus.CANCELED) return;
        BigDecimal inspected = inspectionRepository.findByRequestIds(List.of(r.getId())).stream()
                .flatMap(q -> q.getLines().stream()).map(l -> l.getQuantity())
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        r.setStatus(inspected.compareTo(r.getRequestQty()) >= 0 && inspected.signum() > 0
                ? QualityRequestStatus.INSPECTED : QualityRequestStatus.REQUESTED);
    }

    @Transactional(readOnly = true)
    public QualityInspectionRequest getRequest(Long id) {
        return requestRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("검사요청을 찾을 수 없습니다. id=" + id));
    }

    private java.util.Map<Long, List<com.erp.quality.inspection.QualityInspection>> linkedBy(List<QualityInspectionRequest> rows) {
        if (rows.isEmpty()) return java.util.Map.of();
        return inspectionRepository.findByRequestIds(rows.stream().map(QualityInspectionRequest::getId).toList())
                .stream().collect(java.util.stream.Collectors.groupingBy(q -> q.getRequest().getId()));
    }

    @Transactional
    public RequestResponse updateStatus(Long id, QualityRequestStatus status) {
        QualityInspectionRequest r = getRequest(id);
        /* 원본 목록의 [종결여부] 는 진행중 ↔ 완료 를 오간다. 취소한 요청만 다시 못 연다. */
        if (r.getStatus() == QualityRequestStatus.CANCELED) {
            throw ApiException.badRequest("이미 처리된 요청입니다(현재: " + r.getStatus().getDisplayName() + ").");
        }
        r.setStatus(status);
        return RequestResponse.from(r, inspectionRepository.findByRequestIds(List.of(id)));
    }

    @Transactional
    public void delete(Long id) {
        QualityInspectionRequest r = getRequest(id);
        if (!inspectionRepository.findByRequestIds(List.of(id)).isEmpty()) {
            throw ApiException.badRequest("이 요청으로 만든 품질검사가 있어 삭제할 수 없습니다. 품질검사를 먼저 지우세요.");
        }
        requestRepository.delete(r);
    }

    private String generateNo(LocalDate date) {
        return docNoGenerator.next("QR-", "quality_inspection_requests", "request_no", "request_date", date);
    }

    private static String blankToNull(String v) {
        return (v == null || v.isBlank()) ? null : v;
    }
}
