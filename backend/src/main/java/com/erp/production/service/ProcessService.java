package com.erp.production.service;

import com.erp.common.ApiException;
import com.erp.production.domain.ProductionProcess;
import com.erp.production.dto.ProcessDtos.CreateProcessRequest;
import com.erp.production.dto.ProcessDtos.ProcessResponse;
import com.erp.production.dto.ProcessDtos.UpdateProcessRequest;
import com.erp.production.repository.ProcessRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import com.erp.production.dto.ProcessDtos;

@Service
@RequiredArgsConstructor
public class ProcessService {

    private final ProcessRepository processRepository;

    @Transactional(readOnly = true)
    public List<ProcessResponse> findAll() {
        return processRepository.findAll(Sort.by(Sort.Direction.ASC, "code")).stream()
                .map(ProcessResponse::from)
                .toList();
    }

    @Transactional
    public ProcessResponse create(CreateProcessRequest req) {
        if (processRepository.existsByCode(req.code())) {
            throw ApiException.conflict("이미 존재하는 공정코드입니다: " + req.code());
        }
        ProductionProcess p = ProductionProcess.builder()
                .code(req.code())
                .name(req.name())
                .workcenter(req.workcenter())
                .stdTimeMin(req.stdTimeMin() != null ? req.stdTimeMin() : 0)
                .costPerHr(req.costPerHr() != null ? req.costPerHr() : BigDecimal.ZERO)
                .active(true)
                .build();
        return ProcessResponse.from(processRepository.save(p));
    }

    @Transactional
    public ProcessResponse update(Long id, UpdateProcessRequest req) {
        ProductionProcess p = getProcess(id);
        p.setName(req.name());
        p.setWorkcenter(req.workcenter());
        if (req.stdTimeMin() != null) {
            p.setStdTimeMin(req.stdTimeMin());
        }
        if (req.costPerHr() != null) {
            p.setCostPerHr(req.costPerHr());
        }
        if (req.active() != null) {
            p.setActive(req.active());
        }
        return ProcessResponse.from(p);
    }

    @Transactional
    public void delete(Long id) {
        processRepository.delete(getProcess(id));
    }

    private ProductionProcess getProcess(Long id) {
        return processRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("공정을 찾을 수 없습니다. id=" + id));
    }
}
