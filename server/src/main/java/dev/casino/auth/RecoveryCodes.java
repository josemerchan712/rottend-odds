package dev.casino.auth;

import java.security.SecureRandom;
import java.util.Locale;

/**
 * Códigos de recuperación (sin email no hay otra forma de recuperar una cuenta): 16 caracteres de un alfabeto
 * legible de 32 símbolos (sin I, O, 0 ni 1, que se confunden), 80 bits de azar. Se muestran en grupos de cuatro
 * ("ABCD-EFGH-JKLM-NPQR") y solo se guarda su hash BCrypt.
 */
public final class RecoveryCodes {

    public static final int LENGTH = 16;
    private static final char[] ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();
    private static final SecureRandom RANDOM = new SecureRandom();

    private RecoveryCodes() {}

    /** Un código nuevo, ya con guiones para enseñarlo. */
    public static String generate() {
        StringBuilder sb = new StringBuilder(LENGTH + 3);
        for (int i = 0; i < LENGTH; i++) {
            if (i > 0 && i % 4 == 0) sb.append('-');
            sb.append(ALPHABET[RANDOM.nextInt(ALPHABET.length)]);
        }
        return sb.toString();
    }

    /** Forma canónica para hashear y comparar: sin guiones ni espacios y en mayúsculas. */
    public static String normalize(String code) {
        return code == null ? "" : code.replaceAll("[\\s-]", "").toUpperCase(Locale.ROOT);
    }
}
