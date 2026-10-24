package com.erp.hr.insurance;

import com.erp.hr.insurance.dto.InsuranceReportDtos.ReportRequest;
import com.erp.hr.insurance.dto.InsuranceReportDtos.ReportResponse;
import com.erp.hr.insurance.dto.InsuranceReportDtos.WorkplaceRequest;
import com.erp.hr.insurance.dto.InsuranceReportDtos.WorkplaceResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/hr/insurance")
@RequiredArgsConstructor
public class InsuranceReportController {

    private final InsuranceReportService service;

    @GetMapping("/workplaces")
    public List<WorkplaceResponse> workplaces() { return service.workplaces(); }

    @PostMapping("/workplaces")
    public WorkplaceResponse createWorkplace(@RequestBody WorkplaceRequest req) { return service.createWorkplace(req); }

    @PutMapping("/workplaces/{id}")
    public WorkplaceResponse updateWorkplace(@PathVariable Long id, @RequestBody WorkplaceRequest req) { return service.updateWorkplace(id, req); }

    @PostMapping("/workplaces/{id}/toggle")
    public WorkplaceResponse toggleWorkplace(@PathVariable Long id) { return service.toggleWorkplace(id); }

    @DeleteMapping("/workplaces/{id}")
    public void deleteWorkplace(@PathVariable Long id) { service.deleteWorkplace(id); }

    @GetMapping("/reports")
    public List<ReportResponse> reports(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.list(from, to);
    }

    @GetMapping("/reports/{id}")
    public ReportResponse report(@PathVariable Long id) { return service.find(id); }

    @PostMapping("/reports")
    public ReportResponse create(@Valid @RequestBody ReportRequest req) { return service.create(req); }

    @PutMapping("/reports/{id}")
    public ReportResponse update(@PathVariable Long id, @Valid @RequestBody ReportRequest req) { return service.update(id, req); }

    @PostMapping("/reports/delete")
    public void delete(@RequestBody List<Long> ids) { service.markDeleted(ids); }
}
