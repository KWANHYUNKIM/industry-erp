package com.erp.settings.collectdata;

import com.erp.security.UserPrincipal;
import com.erp.settings.collectdata.dto.CollectDataDtos.CollectDataResponse;
import com.erp.settings.collectdata.dto.CollectDataDtos.CreateCollectDataRequest;
import com.erp.settings.collectdata.dto.CollectDataDtos.UpdateCollectDataRequest;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** 데이터센터 › 수집데이터등록(C001401) API. */
@RestController
@RequestMapping("/api/collect-data")
@RequiredArgsConstructor
public class CollectDataController {

    private final CollectDataService service;

    @GetMapping
    public List<CollectDataResponse> list() {
        return service.findAll();
    }

    @GetMapping("/next-code")
    public Map<String, String> nextCode() {
        return Map.of("code", service.nextCode());
    }

    @PostMapping
    public CollectDataResponse create(@Valid @RequestBody CreateCollectDataRequest req,
                                      @AuthenticationPrincipal UserPrincipal principal) {
        return service.create(req, principal.getName());
    }

    @PutMapping("/{id}")
    public CollectDataResponse update(@PathVariable Long id, @Valid @RequestBody UpdateCollectDataRequest req,
                                      @AuthenticationPrincipal UserPrincipal principal) {
        return service.update(id, req, principal.getName());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
