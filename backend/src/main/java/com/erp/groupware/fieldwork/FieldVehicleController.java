package com.erp.groupware.fieldwork;

import com.erp.groupware.fieldwork.dto.FieldVehicleDtos.FieldVehicleResponse;
import com.erp.groupware.fieldwork.dto.FieldVehicleDtos.SaveFieldVehicleRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 외근 이동수단 마스터. */
@RestController
@RequestMapping("/api/field-vehicles")
@RequiredArgsConstructor
public class FieldVehicleController {

    private final FieldVehicleService service;

    @GetMapping
    public List<FieldVehicleResponse> list(@RequestParam(required = false, defaultValue = "false") boolean all) {
        return service.list(all);
    }

    @PostMapping
    public FieldVehicleResponse create(@Valid @RequestBody SaveFieldVehicleRequest req) {
        return service.create(req);
    }

    @PutMapping("/{id}")
    public FieldVehicleResponse update(@PathVariable Long id, @Valid @RequestBody SaveFieldVehicleRequest req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    public org.springframework.http.ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return org.springframework.http.ResponseEntity.noContent().build();
    }
}
