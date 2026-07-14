package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.PrintSignLine;
import com.erp.domain.PrintSignSlot;
import com.erp.dto.PrintSignDtos.SignLineRequest;
import com.erp.dto.PrintSignDtos.SignLineResponse;
import com.erp.dto.PrintSignDtos.SlotInput;
import com.erp.repository.PrintSignLineRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 인쇄용 결재라인. 출력물 우측 상단의 담당/검토/승인 칸을 관리한다.
 *
 * 기본 결재란은 항상 하나다. 새로 기본으로 지정하면 이전 기본이 내려온다 —
 * 둘이 되면 어느 것으로 인쇄될지 코드가 정하게 되고, 사용자는 왜 그 도장칸이 나왔는지 알 수 없다.
 */
@Service
@RequiredArgsConstructor
public class PrintSignService {

    private final PrintSignLineRepository repository;

    @Transactional(readOnly = true)
    public List<SignLineResponse> findAll() {
        return repository.findAllWithSlots().stream().map(SignLineResponse::from).toList();
    }

    /** 목록 인쇄가 쓰는 기본 결재란. 없으면 null 을 준다(결재란 없이 인쇄한다). */
    @Transactional(readOnly = true)
    public SignLineResponse findDefault() {
        return repository.findDefault().map(SignLineResponse::from).orElse(null);
    }

    @Transactional
    public SignLineResponse create(SignLineRequest req) {
        if (repository.existsByName(req.name())) {
            throw ApiException.conflict("이미 등록된 결재란입니다: " + req.name());
        }
        PrintSignLine line = PrintSignLine.builder()
                .name(req.name())
                .active(req.active() == null || req.active())
                .remark(req.remark())
                .build();
        applySlots(line, req.slots());
        repository.save(line);

        if (Boolean.TRUE.equals(req.defaultLine())) {
            makeDefault(line);
        }
        return SignLineResponse.from(line);
    }

    @Transactional
    public SignLineResponse update(Long id, SignLineRequest req) {
        PrintSignLine line = get(id);
        if (!line.getName().equals(req.name()) && repository.existsByName(req.name())) {
            throw ApiException.conflict("이미 등록된 결재란입니다: " + req.name());
        }
        line.setName(req.name());
        line.setActive(req.active() == null || req.active());
        line.setRemark(req.remark());

        // 칸을 지우고 다시 넣는다. flush 를 끼우지 않으면 Hibernate 가 삭제보다 삽입을 먼저 내보내
        // (sign_line_id, slot_order) 유니크 제약에 걸린다.
        line.clearSlots();
        repository.flush();
        applySlots(line, req.slots());

        if (Boolean.TRUE.equals(req.defaultLine())) {
            makeDefault(line);
        }
        return SignLineResponse.from(line);
    }

    @Transactional
    public void delete(Long id) {
        PrintSignLine line = get(id);
        if (line.isDefaultLine()) {
            throw ApiException.badRequest("기본 결재란은 삭제할 수 없습니다. 다른 결재란을 기본으로 지정한 뒤 지우세요.");
        }
        repository.delete(line);
    }

    /** 기본 지정. 기존 기본은 내려온다(기본은 항상 하나). */
    @Transactional
    public SignLineResponse setDefault(Long id) {
        PrintSignLine line = get(id);
        if (!line.isActive()) {
            throw ApiException.badRequest("사용중지된 결재란은 기본으로 지정할 수 없습니다: " + line.getName());
        }
        makeDefault(line);
        return SignLineResponse.from(line);
    }

    private void makeDefault(PrintSignLine line) {
        for (PrintSignLine other : repository.findByDefaultLineTrue()) {
            if (!other.getId().equals(line.getId())) {
                other.setDefaultLine(false);
            }
        }
        line.setDefaultLine(true);
    }

    private void applySlots(PrintSignLine line, List<SlotInput> slots) {
        for (SlotInput in : slots) {
            line.addSlot(PrintSignSlot.builder()
                    .title(in.title())
                    .signerName(in.signerName() != null && !in.signerName().isBlank() ? in.signerName() : null)
                    .build());
        }
    }

    private PrintSignLine get(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("결재란을 찾을 수 없습니다. id=" + id));
    }
}
