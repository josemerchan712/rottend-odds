package dev.casino.auth;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.random.RandomGenerator;
import java.util.regex.Pattern;

/**
 * Reglas del nombre de jugador (identificador de login y nombre público del ranking).
 *
 * <ul>
 *   <li>3-20 caracteres: letras ASCII, dígitos, guion y guion bajo; sin empezar ni acabar con símbolo.</li>
 *   <li>Único sin distinguir mayúsculas ({@link #key}), pero se guarda y se muestra como lo escribió el jugador.</li>
 *   <li>Nombres reservados (la casa, los prestamistas, el juego, roles de administración).</li>
 *   <li>Filtro básico de palabras ofensivas en español e inglés.</li>
 * </ul>
 *
 * <p>Límites del filtro (decisión consciente, anotada en PROGRESS.md): es una lista corta de raíces, tras quitar
 * guiones y deshacer el «leet» más común (0→o, 1→i, 3→e, 4→a, 5→s, 7→t). Las inequívocas se buscan en todo el
 * nombre; las que aparecen dentro de palabras normales ("computadora" contiene "puta"), solo al principio o al
 * final. No entiende contexto: deja pasar insultos con faltas, en otros idiomas o partidos de otra forma, y aún
 * puede rechazar algún nombre inocente. Se evitaron raíces cortas como "ass". No sustituye a la moderación.
 */
public final class PlayerNames {

    public static final int MIN_LENGTH = 3;
    public static final int MAX_LENGTH = 20;

    /** Empieza y acaba con letra o dígito; en medio, también guion o guion bajo. */
    private static final Pattern FORMAT = Pattern.compile("^[A-Za-z0-9](?:[A-Za-z0-9_-]{1,18})[A-Za-z0-9]$");

    /**
     * Reservados, comparados sin guiones ni mayúsculas. También se rechazan seguidos solo de dígitos
     * ("admin1", "Dueno_2").
     */
    private static final Set<String> RESERVED = Set.of(
            "admin", "administrador", "administrator", "administracion", "moderador", "moderator", "mod",
            "sistema", "system", "root", "soporte", "support", "staff", "oficial", "official",
            "claude", "anthropic",
            "rottenodds", "rotten", "lacasa", "lacasasiemprecobra", "casino",
            "encargado", "crupier", "barman", "dueno", "duenio", "tragaperras", "tragaperrasviviente",
            "diablillo", "zombi", "zombie", "esqueleto", "camarero", "fantasma", "prestamista");

    /** Raíces ofensivas inequívocas (español e inglés): rechazan el nombre estén donde estén. */
    private static final List<String> OFFENSIVE = List.of(
            "mierda", "cabron", "gilipollas", "hijoputa", "malparido", "pendejo", "subnormal", "nazi", "hitler",
            "fuck", "shit", "cunt", "bitch", "nigger", "nigga", "faggot", "whore", "pussy", "retard", "kkk");
    /**
     * Raíces que también aparecen dentro de palabras inocentes ("computadora", "disputa", "apolla"...): solo
     * cuentan al principio o al final del nombre.
     */
    private static final List<String> OFFENSIVE_EDGES = List.of(
            "puta", "puto", "joder", "polla", "verga", "marica", "zorra", "follar", "mongolo", "porn", "slut", "rape");

    /** Sufijos del tema para las sugerencias. */
    private static final List<String> THEME_SUFFIXES = List.of("_Deuda", "_Cero", "_Casa", "_Ficha", "_Suerte", "_Mesa");

    private PlayerNames() {}

    /** Motivo por el que un nombre no se puede usar. */
    public enum Problem {
        FORMATO("Nombre no válido: de 3 a 20 caracteres, solo letras sin tilde, números, '-' y '_', y sin empezar ni acabar con símbolo"),
        RESERVADO("Ese nombre está reservado"),
        NO_PERMITIDO("Ese nombre no está permitido");

        public final String message;

        Problem(String message) {
            this.message = message;
        }
    }

    /** Clave única del nombre: sin espacios alrededor y en minúsculas. */
    public static String key(String name) {
        return name.strip().toLowerCase(Locale.ROOT);
    }

    /** El problema del nombre, si lo tiene (no mira si está ocupado). */
    public static Optional<Problem> problem(String name) {
        if (name == null || !FORMAT.matcher(name.strip()).matches()) return Optional.of(Problem.FORMATO);
        String compact = key(name).replace("-", "").replace("_", "");
        if (isReserved(compact)) return Optional.of(Problem.RESERVADO);
        if (isOffensive(compact)) return Optional.of(Problem.NO_PERMITIDO);
        return Optional.empty();
    }

    public static boolean isAcceptable(String name) {
        return problem(name).isEmpty();
    }

    private static boolean isReserved(String compact) {
        String withoutDigits = compact.replaceAll("\\d+$", "");
        return RESERVED.contains(compact) || (!withoutDigits.isEmpty() && RESERVED.contains(withoutDigits));
    }

    private static boolean isOffensive(String compact) {
        String plain = compact.replace('0', 'o').replace('1', 'i').replace('3', 'e').replace('4', 'a')
                .replace('5', 's').replace('7', 't');
        for (String word : OFFENSIVE) {
            if (plain.contains(word) || compact.contains(word)) return true;
        }
        for (String word : OFFENSIVE_EDGES) {
            if (plain.startsWith(word) || plain.endsWith(word)) return true;
        }
        return false;
    }

    /**
     * Candidatos a sugerencia para un nombre ocupado: variantes con número y con sufijos del tema, recortando
     * la base para que quepan en 20 caracteres. Todos tienen formato válido y pasan el filtro; falta comprobar
     * que estén libres (lo hace el servicio contra la base de datos).
     */
    public static List<String> candidates(String name, RandomGenerator random) {
        String base = name.strip().replaceAll("[^A-Za-z0-9_-]", "");
        base = base.replaceAll("^[-_]+|[-_]+$", "");
        if (base.length() < MIN_LENGTH) base = "Jugador";
        Set<String> out = new LinkedHashSet<>();
        // Intercaladas (temática, número, temática...) para que las primeras cinco mezclen los dos tipos.
        for (int i = 0; i < THEME_SUFFIXES.size(); i++) {
            out.add(fit(base, THEME_SUFFIXES.get(i)));
            out.add(fit(base, String.valueOf(10 + random.nextInt(990))));
        }
        out.add(fit(base, "_" + (1000 + random.nextInt(9000))));
        List<String> valid = new ArrayList<>();
        for (String candidate : out) {
            if (isAcceptable(candidate)) valid.add(candidate);
        }
        return valid;
    }

    private static String fit(String base, String suffix) {
        int room = MAX_LENGTH - suffix.length();
        String trimmed = base.length() > room ? base.substring(0, room) : base;
        trimmed = trimmed.replaceAll("[-_]+$", "");
        return trimmed + suffix;
    }
}
