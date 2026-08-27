package com.erp.production.service;

import com.erp.common.ApiException;
import com.erp.production.domain.ProductionProcess;
import com.erp.production.domain.WorkOrder;
import com.erp.production.domain.WorkResult;
import com.erp.production.dto.WorkResultDtos.CreateWorkResultRequest;
import com.erp.production.dto.WorkResultDtos.WorkResultResponse;
import com.erp.production.domain.ProductionResource;
import com.erp.production.repository.ProcessRepository;
import com.erp.production.repository.ResourceRepository;
import com.erp.production.repository.WorkOrderRepository;
import com.erp.production.repository.WorkResultRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import com.erp.production.dto.WorkResultDtos;

@Service
@RequiredArgsConstructor
public class WorkResultService {

    private final WorkResultRepository workResultRepository;
    private final WorkOrderRepository workOrderRepository;
    private final ProcessRepository processRepository;
    private final ResourceRepository resourceRepository;

    @Transactional(readOnly = true)
    public List<WorkResultResponse> findAll() {
        return workResultRepository.findAllWithRefs().stream()
                .map(WorkResultResponse::from)
                .toList();
    }

    @Transactional
    public WorkResultResponse create(CreateWorkResultRequest req) {
        WorkOrder workOrder = null;
        if (req.workOrderId() != null) {
            workOrder = workOrderRepository.findById(req.workOrderId())
                    .orElseThrow(() -> ApiException.notFound("작업지시를 찾을 수 없습니다. id=" + req.workOrderId()));
        }

        // 입력한 공정명이 공정 마스터에 있으면 실제 관계로 연결한다(자유입력이면 문자열만 남는다)
        ProductionProcess processMaster = processRepository.findByName(req.process()).orElse(null);

        ProductionResource resource = resolveResource(req.resourceId(), processMaster);

        WorkResult wr = WorkResult.builder()
                .workOrder(workOrder)
                .process(req.process())
                .processMaster(processMaster)
                .resource(resource)
                .worker(req.worker())
                .goodQty(req.goodQty() != null ? req.goodQty() : BigDecimal.ZERO)
                .defectQty(req.defectQty() != null ? req.defectQty() : BigDecimal.ZERO)
                .workTimeMin(req.workTimeMin() != null ? req.workTimeMin() : 0)
                .workDate(req.workDate() != null ? req.workDate() : LocalDate.now())
                .note(req.note())
                .build();

        return WorkResultResponse.from(workResultRepository.save(wr));
    }

    @Transactional
    public void delete(Long id) {
        WorkResult wr = workResultRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("작업내역을 찾을 수 없습니다. id=" + id));
        workResultRepository.delete(wr);
    }

    /**
     * 투입자원. 자원등록의 [대상작업]이 정해져 있으면 <b>그 공정에서만</b> 쓸 수 있다.
     *
     * <p>절단기로 검사를 했다고 적히면 "이 공정을 어느 설비로 돌렸나" 가 뜻을 잃는다.
     * 대상작업을 안 정한 자원(범용 설비)은 아무 공정에나 쓸 수 있다.
     */
    private ProductionResource resolveResource(Long resourceId, ProductionProcess processMaster) {
        if (resourceId == null) return null;
        ProductionResource r = resourceRepository.findById(resourceId)
                .orElseThrow(() -> ApiException.badRequest("자원을 찾을 수 없습니다. id=" + resourceId));
        if (r.getProcess() != null && processMaster != null
                && !r.getProcess().getId().equals(processMaster.getId())) {
            throw ApiException.badRequest(String.format(
                    "'%s' 은(는) %s 공정 전용입니다. %s 공정에는 쓸 수 없습니다.",
                    r.getName(), r.getProcess().getName(), processMaster.getName()));
        }
        return r;
    }
}
