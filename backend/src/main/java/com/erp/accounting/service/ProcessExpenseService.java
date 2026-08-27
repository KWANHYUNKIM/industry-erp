package com.erp.accounting.service;

import com.erp.accounting.domain.ProcessExpense;
import com.erp.accounting.dto.ProcessExpenseDtos.ProcessExpenseResponse;
import com.erp.accounting.dto.ProcessExpenseDtos.SaveProcessExpenseRequest;
import com.erp.accounting.repository.ProcessExpenseRepository;
import com.erp.common.ApiException;
import com.erp.inventory.service.WarehouseService;
import com.erp.production.domain.ProductionProcess;
import com.erp.production.repository.ProcessRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 노무비/경비등록 — 원가계산 전 사전작업.
 *
 * <p>같은 달·같은 공정·같은 창고는 한 줄이다. 두 줄이 되면 배부액이 조용히 두 배가 된다.
 */
@Service
@RequiredArgsConstructor
public class ProcessExpenseService {

    private final ProcessExpenseRepository repository;
    private final ProcessRepository processRepository;
    private final WarehouseService warehouseService;

    @Transactional(readOnly = true)
    public List<ProcessExpenseResponse> findAll(String period) {
        List<ProcessExpense> rows = (period == null || period.isBlank())
                ? repository.findAllWithRefs()
                : repository.findByPeriodWithRefs(period.trim());
        return rows.stream().map(ProcessExpenseResponse::from).toList();
    }

    @Transactional
    public ProcessExpenseResponse create(SaveProcessExpenseRequest req) {
        requireFreeKey(req, null);
        ProcessExpense e = ProcessExpense.builder()
                .period(req.period().trim())
                .process(getProcess(req.processId()))
                .warehouse(req.warehouseId() != null ? warehouseService.get(req.warehouseId()) : null)
                .laborCost(req.laborCost())
                .overheadCost(req.overheadCost())
                .remark(req.remark())
                .build();
        return ProcessExpenseResponse.from(repository.save(e));
    }

    @Transactional
    public ProcessExpenseResponse update(Long id, SaveProcessExpenseRequest req) {
        ProcessExpense e = get(id);
        requireFreeKey(req, id);
        e.setPeriod(req.period().trim());
        e.setProcess(getProcess(req.processId()));
        e.setWarehouse(req.warehouseId() != null ? warehouseService.get(req.warehouseId()) : null);
        e.setLaborCost(req.laborCost());
        e.setOverheadCost(req.overheadCost());
        e.setRemark(req.remark());
        return ProcessExpenseResponse.from(e);
    }

    @Transactional
    public void delete(Long id) {
        repository.delete(get(id));
    }

    private void requireFreeKey(SaveProcessExpenseRequest req, Long excludeId) {
        String period = req.period().trim();
        boolean dup = req.warehouseId() != null
                ? repository.existsByPeriodAndProcess_IdAndWarehouse_Id(period, req.processId(), req.warehouseId())
                : repository.existsByPeriodAndProcess_IdAndWarehouseIsNull(period, req.processId());
        if (!dup) return;
        // 수정이면 자기 자신은 중복이 아니다.
        if (excludeId != null) {
            ProcessExpense self = get(excludeId);
            boolean sameKey = self.getPeriod().equals(period)
                    && self.getProcess().getId().equals(req.processId())
                    && java.util.Objects.equals(
                            self.getWarehouse() != null ? self.getWarehouse().getId() : null, req.warehouseId());
            if (sameKey) return;
        }
        throw ApiException.badRequest(
                "같은 기준년월·공정·창고로 이미 등록돼 있습니다: " + period);
    }

    private ProcessExpense get(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("노무비/경비를 찾을 수 없습니다. id=" + id));
    }

    private ProductionProcess getProcess(Long id) {
        return processRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("공정을 찾을 수 없습니다. id=" + id));
    }
}
