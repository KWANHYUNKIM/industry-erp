package com.erp.production.service;

import com.erp.common.ApiException;
import com.erp.production.domain.ProcessOperation;
import com.erp.production.domain.ProductionProcess;
import com.erp.production.dto.ProcessOperationDtos.OperationResponse;
import com.erp.production.dto.ProcessOperationDtos.SaveOperationRequest;
import com.erp.production.repository.ProcessOperationRepository;
import com.erp.production.repository.ProcessRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** 작업코드등록 — 공정 안에서 하는 작업들. BOR 의 작업명이 여기서 나온다. */
@Service
@RequiredArgsConstructor
public class ProcessOperationService {

    private final ProcessOperationRepository repository;
    private final ProcessRepository processRepository;
    private final ProcessService processService;

    @Transactional(readOnly = true)
    public List<OperationResponse> findAll() {
        return repository.findAllWithProcess().stream().map(OperationResponse::from).toList();
    }

    @Transactional
    public OperationResponse create(SaveOperationRequest req) {
        String code = req.code().trim();
        if (repository.existsByCode(code)) {
            throw ApiException.conflict("이미 존재하는 작업코드입니다: " + code);
        }
        ProcessOperation o = ProcessOperation.builder()
                .process(processService.getUsable(req.processId()))
                .code(code)
                .name(req.name().trim())
                .seq(req.seq() != null ? req.seq() : 0)
                .active(req.active() == null || req.active())
                .build();
        return OperationResponse.from(repository.save(o));
    }

    @Transactional
    public OperationResponse update(Long id, SaveOperationRequest req) {
        ProcessOperation o = get(id);
        String code = req.code().trim();
        // 코드를 바꿀 때만 중복을 본다 — 자기 자신은 중복이 아니다.
        if (!o.getCode().equals(code) && repository.existsByCode(code)) {
            throw ApiException.conflict("이미 존재하는 작업코드입니다: " + code);
        }
        o.setProcess(processService.getUsable(req.processId()));
        o.setCode(code);
        o.setName(req.name().trim());
        if (req.seq() != null) {
            o.setSeq(req.seq());
        }
        if (req.active() != null) {
            o.setActive(req.active());
        }
        return OperationResponse.from(o);
    }

    @Transactional
    public void delete(Long id) {
        repository.delete(get(id));
    }

    private ProcessOperation get(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("작업코드를 찾을 수 없습니다. id=" + id));
    }

    private ProductionProcess getProcess(Long id) {
        return processRepository.findById(id)
                .orElseThrow(() -> ApiException.badRequest("공정을 찾을 수 없습니다. id=" + id));
    }
}
