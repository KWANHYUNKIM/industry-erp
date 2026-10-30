package com.erp.groupware.schedule;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ScheduleEventRepository extends JpaRepository<ScheduleEvent, Long> {

    /** 원본 [반복설정] 으로 만든 한 묶음. */
    java.util.List<ScheduleEvent> findByRepeatGroup(String repeatGroup);

    /** 라벨을 지울 때 그 라벨이 붙은 일정. */
    java.util.List<ScheduleEvent> findByLabelCode(String labelCode);
}
