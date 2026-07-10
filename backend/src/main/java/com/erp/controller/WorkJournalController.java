package com.erp.controller;

import com.erp.dto.WorkJournalDtos.CreateWorkJournalRequest;
import com.erp.dto.WorkJournalDtos.WorkJournalResponse;
import com.erp.security.UserPrincipal;
import com.erp.service.WorkJournalService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/work-journals")
@RequiredArgsConstructor
public class WorkJournalController {

    private final WorkJournalService workJournalService;

    @GetMapping
    public List<WorkJournalResponse> list() {
        return workJournalService.findAll();
    }

    @PostMapping
    public ResponseEntity<WorkJournalResponse> create(
            @Valid @RequestBody CreateWorkJournalRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(workJournalService.create(req, principal.getUsername()));
    }
}
