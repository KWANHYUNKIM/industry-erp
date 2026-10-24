package com.erp.hr.dailyworker;

import com.erp.hr.dailyworker.dto.DailyWorkerDtos.DailyWorkerRequest;
import com.erp.hr.dailyworker.dto.DailyWorkerDtos.DailyWorkerResponse;
import com.erp.hr.dailyworker.dto.DailyWorkerDtos.NextCodeResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/hr/daily-workers")
@RequiredArgsConstructor
public class DailyWorkerController {

    private final DailyWorkerService dailyWorkerService;

    @GetMapping
    public List<DailyWorkerResponse> list() {
        return dailyWorkerService.findAll();
    }

    @GetMapping("/next-code")
    public NextCodeResponse nextCode() {
        return new NextCodeResponse(dailyWorkerService.nextCode());
    }

    @GetMapping("/{id}")
    public DailyWorkerResponse get(@PathVariable Long id) {
        return dailyWorkerService.find(id);
    }

    @PostMapping
    public DailyWorkerResponse create(@Valid @RequestBody DailyWorkerRequest req) {
        return dailyWorkerService.create(req);
    }

    @PutMapping("/{id}")
    public DailyWorkerResponse update(@PathVariable Long id, @Valid @RequestBody DailyWorkerRequest req) {
        return dailyWorkerService.update(id, req);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        dailyWorkerService.delete(id);
    }
}
