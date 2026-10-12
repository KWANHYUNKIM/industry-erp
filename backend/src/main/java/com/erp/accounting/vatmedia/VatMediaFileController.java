package com.erp.accounting.vatmedia;

import com.erp.accounting.vatmedia.dto.VatMediaFileDtos.VatMediaFileRequest;
import com.erp.accounting.vatmedia.dto.VatMediaFileDtos.VatMediaFileResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 세무 › 부가세 › 과세자료전산매체(E030208). */
@RestController
@RequestMapping("/api/vat-media-files")
@RequiredArgsConstructor
public class VatMediaFileController {

    private final VatMediaFileService service;

    @GetMapping
    public List<VatMediaFileResponse> list(@RequestParam int fromYear, @RequestParam int toYear) {
        return service.list(fromYear, toYear);
    }

    @PostMapping
    public VatMediaFileResponse create(@Valid @RequestBody VatMediaFileRequest req) {
        return service.create(req);
    }

    @PutMapping("/{id}")
    public VatMediaFileResponse update(@PathVariable Long id, @Valid @RequestBody VatMediaFileRequest req) {
        return service.update(id, req);
    }

    @PostMapping("/delete")
    public ResponseEntity<Void> delete(@RequestBody List<Long> ids) {
        service.delete(ids);
        return ResponseEntity.noContent().build();
    }
}
