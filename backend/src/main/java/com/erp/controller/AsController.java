package com.erp.controller;

import com.erp.dto.AsDtos.AsResponse;
import com.erp.dto.AsDtos.CreateAsRequest;
import com.erp.dto.AsDtos.UpdateAsRequest;
import com.erp.security.UserPrincipal;
import com.erp.service.AsService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/as-requests")
@RequiredArgsConstructor
public class AsController {

    private final AsService asService;

    @GetMapping
    public List<AsResponse> list() {
        return asService.findAll();
    }

    @PostMapping
    public ResponseEntity<AsResponse> create(
            @Valid @RequestBody CreateAsRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(asService.create(req, principal.getUsername()));
    }

    @PatchMapping("/{id}")
    public AsResponse update(@PathVariable Long id, @RequestBody UpdateAsRequest req) {
        return asService.update(id, req);
    }
}
