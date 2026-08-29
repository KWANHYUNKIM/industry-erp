package com.erp.quality.service;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.inventory.domain.Item;
import com.erp.inventory.repository.ItemRepository;
import com.erp.quality.domain.QualityInspectionRequest;
import com.erp.quality.domain.QualityRequestStatus;
import com.erp.quality.dto.QualityRequestDtos.CreateRequestReq;
import com.erp.quality.dto.QualityRequestDtos.RequestResponse;
import com.erp.quality.repository.QualityInspectionRequestRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

@Service
@RequiredArgsConstructor
public class QualityInspectionRequestService {

    private final QualityInspectionRequestRepository requestRepository;
    private final ItemRepository itemRepository;
    private final com.erp.inventory.service.ProjectService projectService;
    private final DocumentNoGenerator docNoGenerator;

    /** status가 null이면 전체, 아니면 해당 상태만(미검사현황=REQUESTED). */
    @Transactional(readOnly = true)
    public List<RequestResponse> findAll(QualityRequestStatus status) {
        List<QualityInspectionRequest> rows = status != null
                ? requestRepository.findByStatusWithRefs(status)
                : requestRepository.findAllWithRefs();
        return rows.stream().map(RequestResponse::from).toList();
    }

    @Transactional
    public RequestResponse create(CreateRequestReq req, String username) {
        Item item = itemRepository.findById(req.itemId())
                .orElseThrow(() -> ApiException.notFound("품목을 찾을 수 없습니다. id=" + req.itemId()));

        LocalDate date = req.requestDate() != null ? req.requestDate() : LocalDate.now();
        String requester = (req.requester() != null && !req.requester().isBlank()) ? req.requester() : username;

        QualityInspectionRequest r = QualityInspectionRequest.builder()
                .requestNo(generateNo(date))
                .requestDate(date)
                .type(req.type())
                .item(item)
                .lotNo(req.lotNo())
                .requestQty(req.requestQty())
                .dueDate(req.dueDate())
                /* 다른 모듈의 것은 그 모듈 service 를 거쳐 얻는다(CLAUDE.md 4.2). */
                .project(req.projectId() != null ? projectService.get(req.projectId()) : null)
                .status(QualityRequestStatus.REQUESTED)
                .requester(requester)
                .remark(req.remark())
                .build();

        return RequestResponse.from(requestRepository.save(r));
    }

    @Transactional
    public RequestResponse updateStatus(Long id, QualityRequestStatus status) {
        QualityInspectionRequest r = requestRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("검사요청을 찾을 수 없습니다. id=" + id));
        if (r.getStatus() != QualityRequestStatus.REQUESTED) {
            throw ApiException.badRequest("이미 처리된 요청입니다(현재: " + r.getStatus().getDisplayName() + ").");
        }
        r.setStatus(status);
        return RequestResponse.from(r);
    }

    @Transactional
    public void delete(Long id) {
        QualityInspectionRequest r = requestRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("검사요청을 찾을 수 없습니다. id=" + id));
        requestRepository.delete(r);
    }

    private String generateNo(LocalDate date) {
        return docNoGenerator.next("QR-", "quality_inspection_requests", "request_no", "request_date", date);
    }
}
