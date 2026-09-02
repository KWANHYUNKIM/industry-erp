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
import java.util.Set;
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

    /**
     * {@code ValidationMessages.properties} 가 주는 일반 문구.
     *
     * <p>이 문구만으로는 어느 항목이 잘못됐는지 알 수 없으므로 필드명을 앞에 붙인다.
     * 제약에 직접 적은 문구("품목분류를 선택하세요.")는 이미 항목을 말하고 있으니 그대로 둔다.
     */
    private static final Set<String> GENERIC_MESSAGES = Set.of(
            "필수 항목입니다.",
            "하나 이상 입력하세요.",
            "0보다 커야 합니다.",
            "0 이상이어야 합니다.",
            "0보다 작아야 합니다.",
            "0 이하여야 합니다.",
            "올바른 이메일 형식이 아닙니다.",
            "형식이 올바르지 않습니다.");

    /**
     * 요청 본문 검증 실패.
     *
     * <p>예전에는 필드 오류 문구를 공백으로 이어 붙이기만 해서
     * {@code "널이어서는 안됩니다 품목분류를 선택하세요. 널이어서는 안됩니다"} 같은 것이 나갔다.
     * 무엇을 고쳐야 하는지 알 수 없고, 같은 문구가 여러 번 반복된다.
     *
     * <p>이제 (1) 일반 문구에는 필드명을 붙이고 (2) 같은 문구를 겹쳐 쓰지 않고
     * (3) 항목을 쉼표로 나눈다.
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException e) {
        String message = e.getBindingResult().getFieldErrors().stream()
                .map(GlobalExceptionHandler::describe)
                .distinct()
                .collect(Collectors.joining(" "));
        if (message.isBlank()) {
            message = "입력값이 올바르지 않습니다.";
        }
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ErrorResponse.of(HttpStatus.BAD_REQUEST, message));
    }

    private static String describe(FieldError error) {
        String message = error.getDefaultMessage();
        if (message == null || message.isBlank()) {
            return error.getField() + ": 값이 올바르지 않습니다.";
        }
        return GENERIC_MESSAGES.contains(message) ? error.getField() + ": " + message : message;
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
     * HTTP 규약 수준의 요청 잘못. 이것들도 없으면 handleGeneral 이 500 으로 받아
     * "Request method 'PUT' is not supported" 같은 내부 문구를 그대로 흘린다.
     * 서버가 고장난 게 아니라 요청이 규약에 안 맞는 것이므로 제 상태코드로 돌려준다.
     */
    @ExceptionHandler(org.springframework.web.HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ErrorResponse> handleMethodNotAllowed(
            org.springframework.web.HttpRequestMethodNotSupportedException e) {
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED)
                .body(ErrorResponse.of(HttpStatus.METHOD_NOT_ALLOWED,
                        "이 주소에서 지원하지 않는 방식입니다: " + e.getMethod()));
    }

    @ExceptionHandler(org.springframework.web.HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<ErrorResponse> handleUnsupportedMediaType(
            org.springframework.web.HttpMediaTypeNotSupportedException e) {
        return ResponseEntity.status(HttpStatus.UNSUPPORTED_MEDIA_TYPE)
                .body(ErrorResponse.of(HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                        "본문 형식을 지원하지 않습니다. JSON 으로 보내세요."));
    }

    /**
     * Accept 헤더로 우리가 못 만드는 형식을 요구한 경우.
     * <p>이게 없으면 <b>401</b> 이 나갔다 — 예외가 /error 로 넘어가면서 인증 정보가 없는
     * 디스패치로 다시 평가되기 때문이다. 토큰이 멀쩡한데 로그인 화면으로 쫓겨나는 셈이라,
     * 왜 그런지 알아낼 방법이 없었다.
     */
    @ExceptionHandler(org.springframework.web.HttpMediaTypeNotAcceptableException.class)
    public ResponseEntity<ErrorResponse> handleNotAcceptable(
            org.springframework.web.HttpMediaTypeNotAcceptableException e) {
        return ResponseEntity.status(HttpStatus.NOT_ACCEPTABLE)
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .body(ErrorResponse.of(HttpStatus.NOT_ACCEPTABLE,
                        "요청한 응답 형식을 만들 수 없습니다. 이 API 는 JSON 만 돌려줍니다."));
    }

    @ExceptionHandler(org.springframework.web.multipart.MultipartException.class)
    public ResponseEntity<ErrorResponse> handleMultipart(
            org.springframework.web.multipart.MultipartException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ErrorResponse.of(HttpStatus.BAD_REQUEST,
                        "파일 업로드 형식이 아닙니다. multipart/form-data 로 보내세요."));
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
        /*
         * 22001 string_data_right_truncation — 글자가 칸보다 길다.
         *
         * <p>여기에 분기가 없어서 <b>맨 아래 일반 문구</b>로 떨어지고 있었다. 공정명에 300자를
         * 넣으면 409 "저장할 수 없습니다. 자료가 서로 맞지 않습니다." 가 떴다 — 길이가 문제라는
         * 말이 어디에도 없으니, 쓰는 사람은 무엇을 고쳐야 할지 모른 채 같은 버튼만 다시 누른다.
         *
         * <p>등록·수정 요청의 글자 칸 382개 중 {@code @Size} 로 길이를 막아 둔 것은 둘뿐이다.
         * 나머지 380개가 전부 이 자리로 떨어진다. 칸마다 애노테이션을 다는 일과 별개로,
         * <b>여기서 한 번에</b> 몇 자까지인지 말해 준다. 값이 잘못된 것이므로 409 가 아니라 400 이다.
         */
        if ("22001".equals(sqlState)) {
            java.util.regex.Matcher m =
                    java.util.regex.Pattern.compile("character varying\\((\\d+)\\)").matcher(raw);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(ErrorResponse.of(HttpStatus.BAD_REQUEST, m.find()
                            ? "입력한 글자가 너무 깁니다. %s자까지 넣을 수 있습니다.".formatted(m.group(1))
                            : "입력한 글자가 너무 깁니다."));
        }
        // 22003 numeric_value_out_of_range — 숫자가 칸보다 크다. 이것도 값이 잘못된 것이다.
        if ("22003".equals(sqlState)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(ErrorResponse.of(HttpStatus.BAD_REQUEST, "입력한 숫자가 너무 큽니다. 자릿수를 확인하세요."));
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
