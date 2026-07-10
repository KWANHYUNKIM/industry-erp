package com.erp.config;

import com.erp.domain.BoardPost;
import com.erp.domain.Survey;
import com.erp.domain.SurveyStatus;
import com.erp.domain.SupplyItem;
import com.erp.repository.BoardRepository;
import com.erp.repository.SupplyRepository;
import com.erp.repository.SurveyRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 최초 기동 시 그룹웨어(설문조사·공용품·게시판) 데모 데이터를 생성한다.
 * 이미 존재하면 건너뛴다 (idempotent).
 */
@Slf4j
@Component
@Order(6)
@RequiredArgsConstructor
public class GroupwareDataInitializer implements CommandLineRunner {

    private final SurveyRepository surveyRepository;
    private final SupplyRepository supplyRepository;
    private final BoardRepository boardRepository;

    @Override
    @Transactional
    public void run(String... args) {
        seedSurveys();
        seedSupplies();
        seedBoard();
    }

    private void seedSurveys() {
        if (surveyRepository.count() > 0) {
            return;
        }
        surveyRepository.save(Survey.builder()
                .title("2026 직원만족도조사").startDate(LocalDate.of(2026, 6, 1)).endDate(LocalDate.of(2026, 7, 31))
                .target(240).responses(186).status(SurveyStatus.OPEN).createdBy("admin").build());
        surveyRepository.save(Survey.builder()
                .title("사내식당 메뉴조사").startDate(LocalDate.of(2026, 5, 10)).endDate(LocalDate.of(2026, 6, 10))
                .target(240).responses(240).status(SurveyStatus.CLOSED).createdBy("admin").build());
        surveyRepository.save(Survey.builder()
                .title("재택근무 선호도조사").startDate(LocalDate.of(2026, 6, 20)).endDate(LocalDate.of(2026, 7, 20))
                .target(180).responses(92).status(SurveyStatus.OPEN).createdBy("admin").build());
        log.info("데모 설문 3건 생성");
    }

    private void seedSupplies() {
        ensureSupply("SP-001", "A4용지", "사무용품", "박스", 42, "복사용지 80g");
        ensureSupply("SP-002", "토너", "소모품", "개", 8, "레이저 프린터용");
        ensureSupply("SP-003", "마우스", "비품", "개", 15, "유선 광마우스");
        ensureSupply("SP-004", "생수", "소모품", "박스", 60, "2L x 6");
        ensureSupply("SP-005", "볼펜", "사무용품", "개", 120, "흑색 0.5mm");
    }

    private void ensureSupply(String code, String name, String category, String unit, long stockQty, String note) {
        if (!supplyRepository.existsByCode(code)) {
            supplyRepository.save(SupplyItem.builder()
                    .code(code).name(name).category(category).unit(unit)
                    .stockQty(BigDecimal.valueOf(stockQty)).note(note).build());
            log.info("데모 공용품 생성 → {} {}", code, name);
        }
    }

    private void seedBoard() {
        if (boardRepository.count() > 0) {
            return;
        }
        boardRepository.save(BoardPost.builder()
                .title("게시판 이용 규칙").category("공지")
                .content("업무관리게시판 이용 시 지켜주실 규칙을 안내드립니다. 상호 존중하는 게시 문화를 부탁드립니다.")
                .author("admin").views(88).build());
        boardRepository.save(BoardPost.builder()
                .title("휴가 사용 안내").category("공지")
                .content("연차 및 반차 사용은 전자결재 시스템을 통해 사전 신청 바랍니다.")
                .author("admin").views(51).build());
        boardRepository.save(BoardPost.builder()
                .title("월간 회의록 공유").category("자료")
                .content("6월 월간 회의록을 공유합니다. 자세한 내용은 첨부 자료를 참고하세요.")
                .author("manager").views(34).build());
        boardRepository.save(BoardPost.builder()
                .title("7월 업무 공지").category("공지")
                .content("7월 주요 업무 일정 및 마감 안내입니다. 각 팀별 일정 확인 바랍니다.")
                .author("admin").views(12).build());
        log.info("데모 게시글 4건 생성");
    }
}
