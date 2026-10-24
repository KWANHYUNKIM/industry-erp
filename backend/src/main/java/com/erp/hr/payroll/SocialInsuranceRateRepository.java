package com.erp.hr.payroll;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface SocialInsuranceRateRepository extends JpaRepository<SocialInsuranceRate, Long> {

    Optional<SocialInsuranceRate> findByRateYear(Integer rateYear);
}
