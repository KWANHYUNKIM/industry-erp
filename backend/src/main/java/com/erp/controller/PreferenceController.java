package com.erp.controller;

import com.erp.dto.PreferenceDtos.PreferenceRequest;
import com.erp.dto.PreferenceDtos.PreferenceResponse;
import com.erp.service.PreferenceService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/preferences")
@RequiredArgsConstructor
public class PreferenceController {

    private final PreferenceService preferenceService;

    @GetMapping
    public PreferenceResponse get() {
        return preferenceService.get();
    }

    @PutMapping
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public PreferenceResponse save(@RequestBody PreferenceRequest req) {
        return preferenceService.save(req);
    }
}
