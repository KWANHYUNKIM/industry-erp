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
        return // 공정은 흐름이라 순번 → 코드 순으로 낸다. 고르는 자리마다 같은 순서로 보여야 한다.
                processRepository.findAll(Sort.by(Sort.Direction.ASC, "sortOrder").and(Sort.by(Sort.Direction.ASC, "code"))).stream()
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
                .sortOrder(req.sortOrder() != null ? req.sortOrder() : 0)
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
        if (req.sortOrder() != null) {
            p.setSortOrder(req.sortOrder());
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

    /**
     * 새로 <b>고르는</b> 자리에서 쓴다. 사용중지한 공정은 거절한다.
     *
     * <p>원본 공정등록에는 [사용중단/재사용]이 있고, 사용중단한 공정은 코드도움에 안 뜬다.
     * 우리는 사용 여부를 저장만 하고 아무 데서도 보지 않아서, 사용중지한 공정으로
     * 공정작업·자원·공정별경비를 그대로 만들 수 있었다 — 실측했다.
     *
     * <p>이미 그 공정을 물고 있는 자료를 <b>읽는</b> 자리에서는 쓰지 않는다.
     * 지난 자료가 사라지면 안 된다.
     */
    @Transactional(readOnly = true)
    public ProductionProcess getUsable(Long id) {
        ProductionProcess p = getProcess(id);
        if (!p.isActive()) {
            throw ApiException.badRequest(
                    "사용중지된 공정입니다: " + p.getCode() + " " + p.getName());
        }
        return p;
    }

    private ProductionProcess getProcess(Long id) {
        return processRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("공정을 찾을 수 없습니다. id=" + id));
    }
}
