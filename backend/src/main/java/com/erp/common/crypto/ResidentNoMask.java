package com.erp.common.crypto;

/** 주민등록번호 가리기 — 응답 기본값. {@code 900101-1******}(앞 6 + 뒷자리 첫 글자). */
public final class ResidentNoMask {

    private ResidentNoMask() {}

    public static String mask(String residentNo) {
        if (residentNo == null || residentNo.isBlank()) return residentNo;
        if (PiiCipher.isEncrypted(residentNo)) return "******";   // 키가 없어 못 푼 값
        String d = residentNo.replaceAll("[^0-9]", "");
        if (d.length() < 7) return "******";
        return d.substring(0, 6) + "-" + d.charAt(6) + "******";
    }

    /** 화면이 가린 값을 그대로 돌려보냈나(* 가 들어 있음) — 그러면 저장값을 바꾸지 않는다. */
    public static boolean isMasked(String v) {
        return v != null && v.indexOf('*') >= 0;
    }
}
