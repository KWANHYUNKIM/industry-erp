package com.erp.hr.employee;

import com.erp.hr.employee.dto.EmployeeProfileDtos.Profile;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 인사카드 창 사원 곁 자료(EmployeeProfile) 읽기 · 저장. */
@Service
@RequiredArgsConstructor
public class EmployeeProfileService {

    private final EmployeeProfileRepository repository;
    private final EmployeeService employeeService;

    @Transactional(readOnly = true)
    public Profile get(Long employeeId) {
        employeeService.get(employeeId);
        return repository.findByEmployee_Id(employeeId).map(Profile::from).orElseGet(Profile::empty);
    }

    @Transactional
    public Profile save(Long employeeId, Profile req) {
        Employee e = employeeService.get(employeeId);
        EmployeeProfile p = repository.findByEmployee_Id(employeeId).orElseGet(() -> EmployeeProfile.builder().employee(e).build());
        p.setPassportNo(blank(req.passportNo()));
        p.setHomeless(blank(req.homeless()));
        p.setHeadName(blank(req.headName()));
        p.setHeadRelation(blank(req.headRelation()));
        p.setResidentPhone(blank(req.residentPhone()));
        p.setFamilyOrigin(blank(req.familyOrigin()));
        p.setDomicile(blank(req.domicile()));
        p.setResidentZip(blank(req.residentZip()));
        p.setResidentAddress(blank(req.residentAddress()));
        p.setBirthDate(req.birthDate());
        p.setLunar(blank(req.lunar()));
        p.setMarried(blank(req.married()));
        p.setWeddingDate(req.weddingDate());
        p.setDisabled(blank(req.disabled()));
        p.setHealthAcquired(req.healthAcquired());
        p.setHealthLost(req.healthLost());
        p.setHealthCardNo(blank(req.healthCardNo()));
        p.setPensionAcquired(req.pensionAcquired());
        p.setPensionLost(req.pensionLost());
        p.setVeteran(blank(req.veteran()));
        p.setVeteranRelation(blank(req.veteranRelation()));
        p.setMilitaryType(blank(req.militaryType()));
        p.setMilitaryBranch(blank(req.militaryBranch()));
        p.setMilitaryUnmet(blank(req.militaryUnmet()));
        p.setMilitaryRank(blank(req.militaryRank()));
        p.setRefName(blank(req.refName()));
        p.setRefRelation(blank(req.refRelation()));
        p.setRefCompany(blank(req.refCompany()));
        p.setRefPhone(blank(req.refPhone()));
        p.setRefDuty(blank(req.refDuty()));
        p.setRefZip(blank(req.refZip()));
        p.setRefAddress(blank(req.refAddress()));
        p.setBondCompany(blank(req.bondCompany()));
        p.setBondNo(blank(req.bondNo()));
        p.setBondPhone(blank(req.bondPhone()));
        p.setBondAmount(req.bondAmount());
        p.setBondFrom(req.bondFrom());
        p.setBondTo(req.bondTo());
        p.setText1(blank(req.text1()));
        p.setText2(blank(req.text2()));
        p.setText3(blank(req.text3()));
        p.setNum1(req.num1());
        p.setNum2(req.num2());
        p.setNum3(req.num3());
        p.setYn1(blank(req.yn1()));
        p.setYn2(blank(req.yn2()));
        p.setYn3(blank(req.yn3()));
        p.setDate1(req.date1());
        p.setDate2(req.date2());
        p.setDate3(req.date3());
        p.setCode1(blank(req.code1()));
        p.setCode2(blank(req.code2()));
        p.setCode3(blank(req.code3()));
        return Profile.from(repository.save(p));
    }

    @Transactional
    public void deleteOf(Long employeeId) {
        repository.deleteByEmployee_Id(employeeId);
    }

    private static String blank(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
