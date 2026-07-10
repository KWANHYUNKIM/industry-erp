package com.erp.controller;

import com.erp.dto.LotDtos.ConsumeLotRequest;
import com.erp.dto.LotDtos.CreateLotRequest;
import com.erp.dto.LotDtos.HoldLotRequest;
import com.erp.dto.LotDtos.LotResponse;
import com.erp.service.LotService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/lots")
@RequiredArgsConstructor
public class LotController {

    private final LotService lotService;

    @GetMapping
    public List<LotResponse> list() {
        return lotService.findAll();
    }

    @PostMapping
    public ResponseEntity<LotResponse> create(@Valid @RequestBody CreateLotRequest req) {
        return ResponseEntity.ok(lotService.create(req));
    }

    @PatchMapping("/{id}/consume")
    public LotResponse consume(@PathVariable Long id, @Valid @RequestBody ConsumeLotRequest req) {
        return lotService.consume(id, req);
    }

    @PatchMapping("/{id}/hold")
    public LotResponse hold(@PathVariable Long id, @RequestBody HoldLotRequest req) {
        return lotService.hold(id, req);
    }
}
