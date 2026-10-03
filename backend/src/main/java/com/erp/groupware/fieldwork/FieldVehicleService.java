package com.erp.groupware.fieldwork;

import com.erp.common.ApiException;
import com.erp.groupware.fieldwork.dto.FieldVehicleDtos.FieldVehicleResponse;
import com.erp.groupware.fieldwork.dto.FieldVehicleDtos.SaveFieldVehicleRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** 외근 이동수단 마스터 — 원본 '이동수단검색' · '이동수단리스트' · '이동수단등록'. */
@Service
@RequiredArgsConstructor
public class FieldVehicleService {

    private final FieldVehicleRepository repository;

    /** 이동수단검색은 쓰는 것만, 이동수단리스트는 사용중단까지(all). 코드 차례. */
    @Transactional(readOnly = true)
    public List<FieldVehicleResponse> list(boolean all) {
        return repository.findAllByOrderByCodeAsc().stream()
                .filter(v -> all || v.isActive())
                .map(FieldVehicleResponse::from)
                .toList();
    }

    @Transactional
    public FieldVehicleResponse create(SaveFieldVehicleRequest req) {
        String code = req.code().trim();
        if (repository.existsByCode(code)) throw ApiException.badRequest("이미 있는 이동수단코드입니다: " + code);
        boolean vehicle = req.vehicle() == null || req.vehicle();
        FieldVehicle v = FieldVehicle.builder()
                .code(code)
                .name(req.name().trim())
                .vehicle(vehicle)
                .carType(vehicle ? req.carType() : null)
                .active(req.active() == null || req.active())
                .build();
        return FieldVehicleResponse.from(repository.save(v));
    }

    @Transactional
    public FieldVehicleResponse update(Long id, SaveFieldVehicleRequest req) {
        FieldVehicle v = repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("이동수단을 찾을 수 없습니다. id=" + id));
        String code = req.code().trim();
        if (!code.equals(v.getCode()) && repository.existsByCode(code)) {
            throw ApiException.badRequest("이미 있는 이동수단코드입니다: " + code);
        }
        boolean vehicle = req.vehicle() == null || req.vehicle();
        v.setCode(code);
        v.setName(req.name().trim());
        v.setVehicle(vehicle);
        v.setCarType(vehicle ? req.carType() : null);
        if (req.active() != null) v.setActive(req.active());
        return FieldVehicleResponse.from(v);
    }

    /** 화면에는 없다(원본도 [사용중단/재사용]뿐) — 시험 자료를 치우는 데만 쓴다. 외근 기록은 글자로 남아 영향이 없다. */
    @Transactional
    public void delete(Long id) {
        repository.delete(repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("이동수단을 찾을 수 없습니다. id=" + id)));
    }
}
