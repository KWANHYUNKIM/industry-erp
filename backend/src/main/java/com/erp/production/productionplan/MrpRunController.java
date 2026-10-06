package com.erp.production.productionplan;

import com.erp.production.productionplan.dto.MrpRunDtos.LineResponse;
import com.erp.production.productionplan.dto.MrpRunDtos.RunResponse;
import com.erp.production.productionplan.dto.MrpRunDtos.SaveRunRequest;
import com.erp.production.productionplan.dto.MrpRunDtos.UpdateLinesRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 원본 생산계획/MRP리스트 — 계산 한 번이 한 줄. [생성]·[수정]·현황의 자료. */
@RestController
@RequestMapping("/api/mrp-runs")
@RequiredArgsConstructor
public class MrpRunController {

    private final MrpRunService mrpRunService;

    @GetMapping
    public List<RunResponse> list() {
        return mrpRunService.findAll();
    }

    @PostMapping
    public ResponseEntity<RunResponse> create(@Valid @RequestBody SaveRunRequest req, java.security.Principal principal) {
        return ResponseEntity.status(HttpStatus.CREATED).body(mrpRunService.create(req, principal.getName()));
    }

    @PutMapping("/{id}")
    public ResponseEntity<Void> update(@PathVariable Long id, @Valid @RequestBody SaveRunRequest req) {
        mrpRunService.update(id, req);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        mrpRunService.delete(id);
        return ResponseEntity.noContent().build();
    }

    /** [생산계획계산 생성](kind=PLAN) · [MRP계산 생성](kind=MRP) — 그 갈래를 새로 계산해 저장한다. */
    @PostMapping("/{id}/generate")
    public List<LineResponse> generate(@PathVariable Long id, @RequestParam MrpRunKind kind) {
        return mrpRunService.generate(id, kind);
    }

    @GetMapping("/{id}/lines")
    public List<LineResponse> lines(@PathVariable Long id, @RequestParam(defaultValue = "PLAN") MrpRunKind kind) {
        return mrpRunService.lines(id, kind);
    }

    /** [수정] — 계획수량만 고친다. */
    @PutMapping("/{id}/lines")
    public List<LineResponse> updateLines(@PathVariable Long id, @RequestParam MrpRunKind kind,
                                          @Valid @RequestBody UpdateLinesRequest req) {
        return mrpRunService.updateLines(id, kind, req);
    }
}
