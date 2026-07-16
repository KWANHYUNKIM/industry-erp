package com.erp.inventory.controller;

import com.erp.inventory.dto.LotDtos.ConsumeLotRequest;
import com.erp.inventory.dto.LotDtos.CreateLotRequest;
import com.erp.inventory.dto.LotDtos.HoldLotRequest;
import com.erp.inventory.dto.LotDtos.LotResponse;
import com.erp.inventory.service.LotService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.inventory.dto.LotDtos;

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
