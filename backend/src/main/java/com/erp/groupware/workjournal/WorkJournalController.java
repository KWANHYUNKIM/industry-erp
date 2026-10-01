package com.erp.groupware.workjournal;

import com.erp.groupware.workjournal.dto.WorkJournalDtos.CreateWorkJournalRequest;
import com.erp.groupware.workjournal.dto.WorkJournalDtos.WorkJournalResponse;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.time.LocalDate;
import com.erp.groupware.workjournal.dto.WorkJournalDtos;

@RestController
@RequestMapping("/api/work-journals")
@RequiredArgsConstructor
public class WorkJournalController {

    private final WorkJournalService workJournalService;

    @GetMapping
    public List<WorkJournalResponse> list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return workJournalService.findAll(from, to);
    }

    @PostMapping
    public ResponseEntity<WorkJournalResponse> create(
            @Valid @RequestBody CreateWorkJournalRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(workJournalService.create(req, principal.getUsername()));
    }
}
