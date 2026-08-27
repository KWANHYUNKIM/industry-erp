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
    private final ResourceService resourceService;
    private final BorService borService;
    private final com.erp.inventory.service.WarehouseService warehouseService;
    private final com.erp.inventory.service.ItemService itemService;
    private final com.erp.inventory.service.ProjectService projectService;

    @Transactional(readOnly = true)
    public List<WorkResultResponse> findAll() {
        return workResultRepository.findAllWithRefs().stream()
                .map(wr -> WorkResultResponse.from(wr, standardOf(wr)))
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

        // 생산공장. inventory 의 공개 service 를 거친다 — 리포지토리를 직접 주입하면
        // 그 모듈의 규칙을 우회하게 된다(CLAUDE.md 4.2).
        com.erp.inventory.domain.Warehouse warehouse =
                req.warehouseId() != null ? warehouseService.get(req.warehouseId()) : null;

        /*
         * 원본 그리드의 [작업품목]. 새로 고르는 자리이므로 사용중지된 품목은 거절한다
         * (getUsable). 이미 저장된 작업내역을 읽을 때는 막지 않는다.
         */
        com.erp.inventory.domain.Item workItem =
                req.workItemId() != null ? itemService.getUsable(req.workItemId()) : null;

        WorkResult wr = WorkResult.builder()
                .workOrder(workOrder)
                .workItem(workItem)
                .process(req.process())
                .processMaster(processMaster)
                .resource(resource)
                .warehouse(warehouse)
                .worker(req.worker())
                .goodQty(req.goodQty() != null ? req.goodQty() : BigDecimal.ZERO)
                .defectQty(req.defectQty() != null ? req.defectQty() : BigDecimal.ZERO)
                .workTimeMin(req.workTimeMin() != null ? req.workTimeMin() : 0)
                .workDate(req.workDate() != null ? req.workDate() : LocalDate.now())
                /* 다른 모듈의 것은 그 모듈 service 를 거쳐 얻는다(CLAUDE.md 4.2). */
                .project(req.projectId() != null ? projectService.get(req.projectId()) : null)
                .note(req.note())
                .build();

        WorkResult saved = workResultRepository.save(wr);
        return WorkResultResponse.from(saved, standardOf(saved));
    }

    /**
     * 이 작업내역의 표준작업시간(분). 원본 작업내역현황의 [표준작업시간] 열.
     *
     * <p>기준 수량은 <b>양품+불량</b>이다. 불량도 만드느라 시간을 쓴 것이라
     * 양품만 세면 불량이 많은 날일수록 '표준보다 오래 걸림' 으로 부풀려진다.
     * 작업지시(=생산품목)나 공정 마스터 연결이 없으면 표준을 말할 수 없어 null.
     */
    private Integer standardOf(WorkResult wr) {
        if (wr.getWorkOrder() == null || wr.getProcessMaster() == null) return null;
        BigDecimal qty = wr.getGoodQty().add(wr.getDefectQty());
        return borService.standardMinutes(
                wr.getWorkOrder().getProduct().getId(), wr.getProcessMaster().getId(), qty);
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
        // 사용중지한 설비로 새 작업을 올릴 수는 없다 — 원본은 코드도움에 띄우지도 않는다.
        ProductionResource r = resourceService.getUsable(resourceId);
        if (r.getProcess() != null && processMaster != null
                && !r.getProcess().getId().equals(processMaster.getId())) {
            throw ApiException.badRequest(String.format(
                    "'%s' 은(는) %s 공정 전용입니다. %s 공정에는 쓸 수 없습니다.",
                    r.getName(), r.getProcess().getName(), processMaster.getName()));
        }
        return r;
    }
}
