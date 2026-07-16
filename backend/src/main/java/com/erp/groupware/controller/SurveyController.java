package com.erp.groupware.controller;

import com.erp.groupware.dto.SurveyDtos.CreateSurveyRequest;
import com.erp.groupware.dto.SurveyDtos.SurveyResponse;
import com.erp.groupware.dto.SurveyDtos.UpdateSurveyRequest;
import com.erp.security.UserPrincipal;
import com.erp.groupware.service.SurveyService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.groupware.dto.SurveyDtos;

@RestController
@RequestMapping("/api/surveys")
@RequiredArgsConstructor
public class SurveyController {

    private final SurveyService surveyService;

    @GetMapping
    public List<SurveyResponse> list() {
        return surveyService.findAll();
    }

    @PostMapping
    public ResponseEntity<SurveyResponse> create(
            @Valid @RequestBody CreateSurveyRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(surveyService.create(req, principal.getUsername()));
    }

    @PatchMapping("/{id}")
    public SurveyResponse update(@PathVariable Long id, @Valid @RequestBody UpdateSurveyRequest req) {
        return surveyService.update(id, req);
    }

    @PostMapping("/{id}/respond")
    public SurveyResponse respond(@PathVariable Long id) {
        return surveyService.respond(id);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        surveyService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
