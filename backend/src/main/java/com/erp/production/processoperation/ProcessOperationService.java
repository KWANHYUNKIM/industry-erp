package com.erp.production.processoperation;

import com.erp.production.process.ProcessService;
import com.erp.common.ApiException;
import com.erp.production.process.ProductionProcess;
import com.erp.production.processoperation.dto.ProcessOperationDtos.OperationResponse;
import com.erp.production.processoperation.dto.ProcessOperationDtos.SaveOperationRequest;
import com.erp.production.process.ProcessRepository;
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

    /**
     * 투입자원유형. 원본에서 잰 값은 '기계' 하나다(2026-10-29) — 나머지 갈래는 원본에서 못 봤다.
     * 자원등록의 [구분](설비 · 인력 · 외주)과 같은 세 갈래로 둔다.
     */
    public static final List<String> RESOURCE_TYPES = List.of("기계", "인력", "외주");
    /** 작업기준품목. 원본 실측 생산품 · 소모품. */
    public static final List<String> BASE_ITEMS = List.of("생산품", "소모품");

    private static String pick(String v, List<String> allowed, String label) {
        if (v == null || v.isBlank()) return null;
        String t = v.trim();
        if (!allowed.contains(t)) {
            throw ApiException.badRequest(label + "은(는) " + String.join(" · ", allowed) + " 중 하나입니다: " + t);
        }
        return t;
    }

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
                .resourceType(pick(req.resourceType(), RESOURCE_TYPES, "투입자원유형"))
                .baseItem(pick(req.baseItem(), BASE_ITEMS, "작업기준품목"))
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
        // 비워 보내면 지운다 — 고치는 창이 늘 두 칸을 같이 보낸다.
        o.setResourceType(pick(req.resourceType(), RESOURCE_TYPES, "투입자원유형"));
        o.setBaseItem(pick(req.baseItem(), BASE_ITEMS, "작업기준품목"));
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
