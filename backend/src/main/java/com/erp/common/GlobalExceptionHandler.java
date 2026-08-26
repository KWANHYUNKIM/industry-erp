package com.erp.common;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 전역 예외 처리. 일관된 JSON 형태로 오류를 반환한다.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private record ErrorResponse(int status, String message, LocalDateTime timestamp) {
        static ErrorResponse of(HttpStatus status, String message) {
            return new ErrorResponse(status.value(), message, LocalDateTime.now());
        }
    }

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ErrorResponse> handleApi(ApiException e) {
        return ResponseEntity.status(e.getStatus())
                .body(ErrorResponse.of(e.getStatus(), e.getMessage()));
    }

    @ExceptionHandler(BadCredentialsException.class)
    public ResponseEntity<ErrorResponse> handleBadCredentials(BadCredentialsException e) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(ErrorResponse.of(HttpStatus.UNAUTHORIZED, "아이디 또는 비밀번호가 올바르지 않습니다."));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ErrorResponse> handleAccessDenied(AccessDeniedException e) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(ErrorResponse.of(HttpStatus.FORBIDDEN, "접근 권한이 없습니다."));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException e) {
        String message = e.getBindingResult().getFieldErrors().stream()
                .map(FieldError::getDefaultMessage)
                .collect(Collectors.joining(" "));
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ErrorResponse.of(HttpStatus.BAD_REQUEST, message));
    }

    /**
     * 잘못된 요청(필수 파라미터 누락·타입 불일치·본문 파싱 실패)은 클라이언트 잘못이므로 400이다.
     * 이것들이 아래 Exception 핸들러로 떨어져 500이 되면, 모니터링에 가짜 서버 장애가 쌓이고
     * 프론트는 "서버가 죽었다"고 재시도한다. 실제로 /journals 를 from 없이 부르면 500이 났다.
     */
    @ExceptionHandler({
            MissingServletRequestParameterException.class,
            MethodArgumentTypeMismatchException.class,
            HttpMessageNotReadableException.class,
    })
    public ResponseEntity<ErrorResponse> handleBadRequest(Exception e) {
        String message;
        if (e instanceof MissingServletRequestParameterException me) {
            message = "필수 요청 파라미터가 없습니다: " + me.getParameterName();
        } else if (e instanceof MethodArgumentTypeMismatchException te) {
            message = "요청 파라미터 형식이 올바르지 않습니다: " + te.getName() + "=" + te.getValue();
        } else {
            message = "요청 본문을 읽을 수 없습니다.";
        }
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ErrorResponse.of(HttpStatus.BAD_REQUEST, message));
    }

    /**
     * 업로드 크기 초과. 톰캣이 요청을 자르며 던지는 예외라 서비스의 크기 검사까지 가지 못한다.
     * 사용자 잘못이므로 500 이 아니라 400 으로 돌려준다.
     */
    @ExceptionHandler(org.springframework.web.multipart.MaxUploadSizeExceededException.class)
    public ResponseEntity<ErrorResponse> handleUploadTooLarge(
            org.springframework.web.multipart.MaxUploadSizeExceededException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ErrorResponse.of(HttpStatus.BAD_REQUEST, "파일이 너무 큽니다. 최대 "
                        + (FileStorageService.MAX_FILE_BYTES / 1024 / 1024) + "MB 까지 올릴 수 있습니다."));
    }

    /**
     * 없는 경로. 이게 없으면 아래 handleGeneral 이 받아서 <b>500</b> 을 내고,
     * 메시지에 "No static resource api/..." 같은 내부 사정까지 그대로 실어 보낸다.
     * 프론트가 오타를 낸 건지 서버가 죽은 건지 구분이 안 되므로 404 로 돌려준다.
     */
    @ExceptionHandler({
            org.springframework.web.servlet.resource.NoResourceFoundException.class,
            org.springframework.web.servlet.NoHandlerFoundException.class,
    })
    public ResponseEntity<ErrorResponse> handleNotFound(Exception e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ErrorResponse.of(HttpStatus.NOT_FOUND, "요청한 경로를 찾을 수 없습니다."));
    }

    /**
     * DB 제약 위반. 이게 없으면 아래 handleGeneral 이 받아 <b>500</b> 을 내고,
     * 메시지에 Postgres 원문이 통째로 실린다 — 제약 이름·테이블명·SQL 까지.
     * 쓰는 사람은 "지울 수 없다" 는 사실을 영어 DB 오류 더미에서 읽어내야 했다.
     *
     * <p>가장 흔한 경우는 <b>쓰는 중인 마스터를 지우려 할 때</b>다(품목·거래처·창고).
     * 그건 서버 잘못이 아니라 요청이 성립하지 않는 것이므로 409 로 돌려준다.
     */
    @ExceptionHandler(org.springframework.dao.DataIntegrityViolationException.class)
    public ResponseEntity<ErrorResponse> handleDataIntegrity(
            org.springframework.dao.DataIntegrityViolationException e) {
        String sqlState = sqlStateOf(e);
        String raw = rootMessage(e);

        // 23503 foreign_key_violation — 다른 자료가 이 행을 가리키고 있다
        if ("23503".equals(sqlState)) {
            String where = referencingTable(raw);
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(ErrorResponse.of(HttpStatus.CONFLICT,
                            where == null
                                    ? "다른 자료에서 쓰고 있어 지울 수 없습니다."
                                    : "%s에서 쓰고 있어 지울 수 없습니다. 먼저 그쪽을 정리하세요.".formatted(where)));
        }
        // 23505 unique_violation
        if ("23505".equals(sqlState)) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(ErrorResponse.of(HttpStatus.CONFLICT, "이미 같은 값이 등록돼 있습니다."));
        }
        // 23502 not_null_violation · 23514 check_violation — 값이 잘못된 것이라 400
        if ("23502".equals(sqlState)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(ErrorResponse.of(HttpStatus.BAD_REQUEST, "필수 값이 비어 있습니다."));
        }
        if ("23514".equals(sqlState)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(ErrorResponse.of(HttpStatus.BAD_REQUEST, "허용되지 않는 값입니다."));
        }
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(ErrorResponse.of(HttpStatus.CONFLICT, "저장할 수 없습니다. 자료가 서로 맞지 않습니다."));
    }

    private static String sqlStateOf(Throwable e) {
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t instanceof java.sql.SQLException sql && sql.getSQLState() != null) {
                return sql.getSQLState();
            }
        }
        return null;
    }

    private static String rootMessage(Throwable e) {
        Throwable t = e;
        while (t.getCause() != null) t = t.getCause();
        return t.getMessage() != null ? t.getMessage() : "";
    }

    /**
     * FK 위반 메시지에서 <b>가리키는 쪽</b> 테이블을 뽑아 사람 말로 바꾼다.
     * Postgres 는 {@code ... on table "sales"} 형태로 알려 준다.
     * 표에 없는 테이블이면 null 을 돌려 일반 문구를 쓰게 한다 — 테이블명을 그대로
     * 보여 주면 결국 내부 사정을 노출하는 셈이다.
     */
    private static String referencingTable(String raw) {
        // Postgres 메시지에는 on table 이 두 번 나온다:
        //   update or delete on table "items" ... constraint "..." on table "stock_transactions"
        // 앞엣것은 지우려는 테이블이고, 알려 줘야 할 건 뒤엣것(가리키는 쪽)이다.
        java.util.regex.Matcher m =
                java.util.regex.Pattern.compile("on table \"(\\w+)\"").matcher(raw);
        String last = null;
        while (m.find()) last = m.group(1);
        return last == null ? null : TABLE_LABELS.get(last);
    }

    private static final Map<String, String> TABLE_LABELS = Map.ofEntries(
            Map.entry("sales", "판매전표"),
            Map.entry("sales_lines", "판매전표"),
            Map.entry("sales_orders", "주문서"),
            Map.entry("sales_order_lines", "주문서"),
            Map.entry("purchases", "구매전표"),
            Map.entry("purchase_lines", "구매전표"),
            Map.entry("purchase_orders", "발주서"),
            Map.entry("quotations", "견적서"),
            Map.entry("shipments", "출하"),
            Map.entry("stocks", "재고"),
            Map.entry("stock_transactions", "재고이동 내역"),
            Map.entry("stock_transfers", "창고이동"),
            Map.entry("stock_adjustments", "기타이동"),
            Map.entry("staged_stock_adjustments", "재고실사"),
            Map.entry("productions", "생산실적"),
            Map.entry("work_orders", "작업지시"),
            Map.entry("boms", "BOM"),
            Map.entry("bom_lines", "BOM"),
            Map.entry("material_issues", "생산불출"),
            Map.entry("quality_inspections", "품질검사"),
            Map.entry("as_requests", "A/S"),
            Map.entry("settlements", "수금·지급"),
            Map.entry("tax_invoices", "세금계산서"),
            Map.entry("expenses", "비용전표"),
            Map.entry("journal_entries", "회계전표"),
            Map.entry("employees", "사원"),
            Map.entry("payslips", "급여명세"));

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGeneral(Exception e) {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ErrorResponse.of(HttpStatus.INTERNAL_SERVER_ERROR,
                        "서버 오류가 발생했습니다: " + e.getMessage()));
    }
}
