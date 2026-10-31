package com.erp.common.crypto;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * 개인정보 칸(주민등록번호) 암호화 — AES-256-GCM. 적는 값은 {@code enc:v1:} + base64(IV 12바이트 + 암호문 + 태그).
 *
 * <p>키는 {@code app.pii.key}(환경변수 ERP_PII_KEY · 로컬 config/local.properties), base64 32바이트. DB 와 다른 곳에 둔다 —
 * <b>키를 잃으면 암호화된 값은 되살릴 수 없다</b>(백업도 마찬가지). 키가 없으면 운영은 기동 실패,
 * dev 프로필만 평문 그대로 두고 경고한다(나중에 키를 넣고 띄우면 {@code PiiEncryptionBackfill} 이 암호화한다).
 *
 * <p>JPA 변환기({@link EncryptedStringConverter})가 Spring 빈을 받지 않아도 되게 정적 인스턴스로 연다.
 */
@Slf4j
@Component
public class PiiCipher {

    public static final String PREFIX = "enc:v1:";
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;
    private static final SecureRandom RANDOM = new SecureRandom();

    private static volatile SecretKeySpec key;

    public PiiCipher(@Value("${app.pii.key:}") String base64Key, Environment env) {
        String k = base64Key == null ? "" : base64Key.trim();
        byte[] raw = null;
        if (!k.isEmpty()) {
            try {
                raw = Base64.getDecoder().decode(k);
            } catch (IllegalArgumentException e) {
                raw = null;
            }
        }
        if (raw != null && raw.length == 32) {
            key = new SecretKeySpec(raw, "AES");
            return;
        }
        String problem = k.isEmpty() ? "비어 있다" : "base64 32바이트가 아니다";
        if (env.acceptsProfiles(Profiles.of("dev"))) {
            key = null;
            log.warn("주민번호 암호화 키(app.pii.key · ERP_PII_KEY)가 {} — dev 프로필이라 평문으로 둔다. "
                    + "키를 넣으려면 config/local.properties(예: openssl rand -base64 32).", problem);
            return;
        }
        throw new IllegalStateException("주민번호 암호화 키(app.pii.key · 환경변수 ERP_PII_KEY)가 " + problem
                + ". base64 32바이트 값을 주세요(예: openssl rand -base64 32). 키를 잃으면 암호화된 값은 되살릴 수 없습니다.");
    }

    public static boolean enabled() {
        return key != null;
    }

    public static boolean isEncrypted(String v) {
        return v != null && v.startsWith(PREFIX);
    }

    /** 평문 → 저장값. 키가 없으면(dev) 평문 그대로. 이미 암호화된 값은 그대로. */
    public static String encrypt(String plain) {
        if (plain == null || plain.isEmpty() || isEncrypted(plain)) return plain;
        SecretKeySpec k = key;
        if (k == null) return plain;
        try {
            byte[] iv = new byte[IV_BYTES];
            RANDOM.nextBytes(iv);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, k, new GCMParameterSpec(TAG_BITS, iv));
            byte[] ct = c.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            byte[] out = new byte[iv.length + ct.length];
            System.arraycopy(iv, 0, out, 0, iv.length);
            System.arraycopy(ct, 0, out, iv.length, ct.length);
            return PREFIX + Base64.getEncoder().encodeToString(out);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("개인정보 암호화 실패", e);
        }
    }

    /**
     * 저장값 → 평문. 암호화 안 된 옛 값은 그대로(백필 전).
     * 키가 없거나 맞지 않으면 <b>암호문을 그대로</b> 돌려준다 — null 로 주면 그 행을 다른 칸 때문에 저장할 때 암호문이 지워진다.
     * (encrypt 는 이미 암호화된 값을 그대로 두고, 가리기는 암호문을 '******' 로 보인다.)
     */
    public static String decrypt(String stored) {
        if (!isEncrypted(stored)) return stored;
        SecretKeySpec k = key;
        if (k == null) {
            log.warn("암호화된 개인정보가 있는데 키(app.pii.key)가 없어 읽지 못한다");
            return stored;
        }
        try {
            byte[] in = Base64.getDecoder().decode(stored.substring(PREFIX.length()));
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, k, new GCMParameterSpec(TAG_BITS, in, 0, IV_BYTES));
            return new String(c.doFinal(in, IV_BYTES, in.length - IV_BYTES), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            log.warn("개인정보 복호화 실패(키가 바뀌었나?): {}", e.getClass().getSimpleName());
            return stored;
        }
    }
}
