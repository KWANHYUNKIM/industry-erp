package com.erp.groupware.fieldwork;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface FieldVehicleRepository extends JpaRepository<FieldVehicle, Long> {

    List<FieldVehicle> findAllByOrderByCodeAsc();

    boolean existsByCode(String code);
}
