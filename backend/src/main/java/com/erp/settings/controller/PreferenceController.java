package com.erp.settings.controller;

import com.erp.settings.dto.PreferenceDtos.PreferenceRequest;
import com.erp.settings.dto.PreferenceDtos.PreferenceResponse;
import com.erp.settings.service.PreferenceService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import com.erp.settings.dto.PreferenceDtos;

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
    public PreferenceResponse save(@RequestBody PreferenceRequest req) {
        return preferenceService.save(req);
    }
}
