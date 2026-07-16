package com.erp.production.service;

import com.erp.common.ApiException;
import com.erp.production.domain.ProductionProcess;
import com.erp.production.domain.WorkOrder;
import com.erp.production.domain.WorkResult;
import com.erp.production.dto.WorkResultDtos.CreateWorkResultRequest;
import com.erp.production.dto.WorkResultDtos.WorkResultResponse;
import com.erp.production.repository.ProcessRepository;
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

        WorkResult wr = WorkResult.builder()
                .workOrder(workOrder)
                .process(req.process())
                .processMaster(processMaster)
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
}
