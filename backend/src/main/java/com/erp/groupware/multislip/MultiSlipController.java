package com.erp.groupware.multislip;

import com.erp.groupware.multislip.dto.MultiSlipDtos.ChangeMultiSlipStatusRequest;
import com.erp.groupware.multislip.dto.MultiSlipDtos.MultiSlipResponse;
import com.erp.groupware.multislip.dto.MultiSlipDtos.SaveMultiSlipRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 그룹웨어 › 다목적관리 — 다목적 전표 넷(board 로 가른다). */
@RestController
@RequestMapping("/api/multi-slips")
@RequiredArgsConstructor
public class MultiSlipController {

    private final MultiSlipService multiSlipService;

    @GetMapping
    public List<MultiSlipResponse> list(@RequestParam MultiSlipBoard board) {
        return multiSlipService.findAll(board);
    }

    @GetMapping("/{id}")
    public MultiSlipResponse get(@PathVariable Long id) {
        return multiSlipService.get(id);
    }

    @PostMapping
    public MultiSlipResponse create(@Valid @RequestBody SaveMultiSlipRequest req) {
        return multiSlipService.create(req);
    }

    @PutMapping("/{id}")
    public MultiSlipResponse update(@PathVariable Long id, @Valid @RequestBody SaveMultiSlipRequest req) {
        return multiSlipService.update(id, req);
    }

    @PatchMapping("/status")
    public List<MultiSlipResponse> changeStatus(@Valid @RequestBody ChangeMultiSlipStatusRequest req) {
        return multiSlipService.changeStatus(req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        multiSlipService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
