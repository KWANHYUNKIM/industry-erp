package com.erp.settings.preference;

import jakarta.validation.Valid;
import com.erp.settings.preference.dto.PreferenceDtos.PreferenceRequest;
import com.erp.settings.preference.dto.PreferenceDtos.PreferenceResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import com.erp.settings.preference.dto.PreferenceDtos;

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
    public PreferenceResponse save(@Valid @RequestBody PreferenceRequest req) {
        return preferenceService.save(req);
    }
}
