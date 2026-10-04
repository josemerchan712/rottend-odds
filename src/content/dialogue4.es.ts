import type { DialogueLines } from '../game/dialogue';

// PENDIENTE DE REVISIÓN: líneas escritas sin aprobar todavía (mesa 4).
// Las líneas con `absence` solo salen tras una ausencia corta (< 1 h) o larga (≥ 1 h).

/**
 * Líneas de la Crupier (español). Mismo motor que las otras mesas.
 * Tono: formal, fría y ceremoniosa; trata el juego como un ritual. Habla de manos, cartas, la banca,
 * barajar y repartir. Nunca bromea ni levanta la voz. Frases cortas (≤ 90 caracteres), sin explicar
 * mecánicas. Deformada: la máscara cae y el ritual se vuelve hambre.
 * `buyCrupier` aquí es la contratación del esqueleto barajador.
 */
export const DIALOGUE4_ES: DialogueLines = {
  newGame: {
    any: [
      'Tome asiento. La banca le estaba esperando.',
      'Diez millones. La deuda se paga mano a mano, como manda el rito.',
      'Barajo una vez por mano. Las reglas no cambian. Usted, sí.',
      'Bienvenido a mi mesa. Aquí nadie toca las cartas salvo yo.',
      'Su apuesta, por favor. El rito comienza cuando usted quiera.',
    ],
  },
  sessionResume: {
    calm: [
      'Ha vuelto. Su silla seguía en su sitio.',
      'Retomamos donde lo dejamos. La baraja recuerda.',
      { text: 'Breve ausencia. La banca apenas lo ha notado.', absence: 'short' },
      { text: 'Larga ausencia. Consta en el registro de la mesa.', absence: 'long' },
      'Siéntese. La mano siguiente le pertenece.',
    ],
    uneasy: [
      'Ha regresado. Los que regresan suelen deber más.',
      { text: 'Ha tardado. Cada hora tiene su precio en esta mesa.', absence: 'long' },
      { text: 'Tan pronto. Las cartas le llaman, ¿verdad?', absence: 'short' },
      'Ocupe su lugar. El rito no admite demoras.',
      'Bienvenido de nuevo. La banca no olvida una cuenta.',
    ],
    deformed: [
      'Ha vuelto. Ha vuelto. Siempre vuelven a la mesa.',
      'Le oí barajar desde la puerta. Era su corazón.',
      'Nunca se levantó de esa silla. Solo lo soñó.',
      'Siéntese. La silla conoce su peso.',
      'Bienv... No. Usted nunca ha salido de esta mano.',
    ],
  },
  bigLoss: {
    calm: [
      'La banca gana. Es la costumbre.',
      'Una mano perdida. Recojo sus fichas con todo respeto.',
      'Las cartas han hablado. Yo solo las pongo sobre el tapete.',
      'Mala mano. El rito sigue.',
      'Lamento su pérdida. Formalmente.',
    ],
    uneasy: [
      'Otra mano para la banca. Empieza a ser una tradición.',
      'Sus fichas cambian de lado con mucha elegancia.',
      'Pierde con dignidad. Eso no reduce la deuda.',
      'La baraja le ha juzgado. Yo solo ejecuto.',
      'Cada mano perdida queda escrita en su cuenta.',
    ],
    deformed: [
      'Más. Ponga más fichas en el altar.',
      'Oigo sus fichas caer. Suenan a huesos.',
      'Pierde. Debajo de la máscara, algo sonríe.',
      'Todo vuelve a la banca. Usted también volverá.',
      'Entréguemelo. Mano tras mano.',
    ],
  },
  bigWin: {
    calm: [
      'Mano ganadora. La banca paga, como es debido.',
      'Enhorabuena. El rito también contempla la suerte.',
      'Las cartas le sonríen. No siempre lo hacen.',
      'Gana usted. Anoto la mano con cuidado.',
      'Un buen reparto. Disfrútelo en silencio.',
    ],
    uneasy: [
      'Gana. Tomo nota de cada carta que recibe.',
      'Demasiadas manos buenas. La banca lo observa.',
      'Cobre. La deuda no se ha movido.',
      'Su suerte es notable. Lo notable dura poco.',
      'Pago su mano. Con la debida frialdad.',
    ],
    deformed: [
      'Gana. Gana. Y sigue sentado en mi mesa.',
      'Esas fichas ya llevan grabado mi nombre.',
      'Ríase. Me gusta oír cómo se rompe una risa.',
      'Más alto. La caída será más ceremoniosa.',
      'Engorde. La banca recoge al final del rito.',
    ],
  },
  jackpot: {
    calm: [
      'Tres sietes. Veintiuno perfecto. Hacía años.',
      'El pozo se abre para usted. Una vez.',
      'Siete, siete, siete. La baraja ha cumplido su rito.',
      'Jackpot. La banca paga sin pestañear.',
      'Tres sietes. Guárdelos. Las cartas tienen memoria.',
    ],
    uneasy: [
      'El pozo era de la casa. Se lo presto.',
      'Tres sietes. Alguien ha tocado mi baraja.',
      'Jackpot. La banca rehará su cuenta con calma.',
      'Demasiado brillo para una deuda tan grande.',
      'Pagado. Lo anoto como un préstamo de la suerte.',
    ],
    deformed: [
      'Siete. Siete. Siete. El número de las grietas.',
      'Me ha vaciado el pozo. Le vaciaré a usted.',
      'Tres sietes. Tres costuras en mis ojos.',
      'Lléveselo. Todo vuelve a la banca.',
      'Veintiuno. La edad exacta de la última máscara.',
    ],
  },
  broke: {
    calm: [
      'Sin fichas. La mesa no admite deudas de palabra.',
      'Su montón ha desaparecido. El rito exige ofrenda.',
      'No queda nada. Vaya a barajar para otros.',
      'Sin fichas no hay mano. Así es la regla.',
      'Bolsillos vacíos. La banca espera, educadamente.',
    ],
    uneasy: [
      'Cero. Es una cifra muy limpia.',
      'Nada sobre el tapete. Mucho en la cuenta.',
      'Sin fichas. Hay mazos que ordenar en la trastienda.',
      'Vacío. La banca prefiere las manos llenas.',
      'Sin nada. Así me escucha mejor.',
    ],
    deformed: [
      'Nada. Nada. Solo quedamos usted y la baraja.',
      'Sin fichas. Puede apostar otra cosa.',
      'Cero. Un hueco en la mesa con su forma.',
      'Vacío. Le reparto igual. Con otras cartas.',
      'Hueco. Suena a hueco cuando respira.',
    ],
  },
  enterBackroom: {
    calm: [
      'Vaya. Las barajas no se ordenan solas.',
      'Detrás hay cartas sueltas y fichas ajenas. Recójalas.',
      'Un trabajo humilde. El rito también lo necesita.',
      'Cuidado con las cenizas. Algunas aún queman.',
      'La trastienda forma parte de la mesa.',
    ],
    uneasy: [
      'Vaya detrás. No cuente las cartas que encuentre.',
      'Recoja. No pregunte de quién son esas fichas.',
      'También ahí detrás le observo.',
      'Trabaje. El sudor también se anota.',
      'Los mazos atascados guardan secretos. No los fuerce.',
    ],
    deformed: [
      'Ahí detrás hay manos que nadie terminó de jugar.',
      'Agáchese. Más. Recoja lo que dejaron los otros.',
      'Las cartas del suelo le miran. Bocabajo.',
      'Vaya. La puerta recuerda a quien entra.',
      'Recoja los anillos. Los dedos ya no los necesitan.',
    ],
  },
  returnCasino: {
    calm: [
      'De vuelta. Su silla le aguardaba.',
      'Manos limpias. Puede apostar.',
      'Trae fichas. La banca lo agradece.',
      'Siéntese. Reparto en cuanto usted diga.',
      'El tapete está listo. El rito también.',
    ],
    uneasy: [
      'Trae poco. Lo mínimo para el rito.',
      '¿Eso es todo? La banca esperaba más.',
      'Las manos no se han detenido mientras usted barría.',
      'Siéntese. La cuenta ha seguido su curso.',
      'Vuelve a mi mesa. Como corresponde.',
    ],
    deformed: [
      'Vuelve con cenizas en las manos. Bien.',
      'Le esperaba. Barajando. Barajando.',
      'La baraja dijo su nombre al cortar.',
      'Cada mano le deja un poco más vacío.',
      'Acérquese. Más. El tapete tiene frío.',
    ],
  },
  buyCrupier: {
    any: [
      'Un esqueleto barajador. Discreto. Puntual. Eterno.',
      'Jugará por usted. No le temblarán las manos. No tiene.',
      'Buen servidor. Barajó en esta mesa mucho tiempo.',
      'Delega el rito. Es una decisión respetable.',
      'Otro jugador en mi mesa. Otra cuenta que llevar.',
    ],
  },
  phaseUneasy: {
    any: [
      'Un tercio de la deuda. La banca empieza a mirarle.',
      'Acumula con método. Eso inquieta a la casa.',
      'Ya no es un jugador más. Es una mano que crece.',
      'Un tercio. Lo difícil del rito empieza ahora.',
      'Le observo con más atención. Por respeto.',
    ],
  },
  phaseDeformed: {
    any: [
      'Casi. ¿Sabe qué ocurre en la última mano?',
      'Tantas fichas. La máscara empieza a pesar.',
      'Huele a final de partida. Me gusta ese olor.',
      'Quedan pocas manos. Para ambos.',
      'Míreme bien. Así queda mi cara cuando alguien va a saldar.',
    ],
  },
  debtPaid: {
    any: [
      'Cuenta saldada. La banca se inclina ante usted.',
      'Diez millones. Exactos. El rito ha concluido.',
      'Pagado. Más abajo hay otra mesa. Y otro dueño.',
      'Ha cumplido. Pocos se levantan de mi mesa.',
      'Gracias por su partida. La baraja no le olvidará.',
    ],
  },
  silence: {
    calm: [
      'Su turno. El rito espera, pero no eternamente.',
      'Silencio en la mesa. Lo respeto.',
      'Las cartas no se reparten solas.',
      'Tome su tiempo. La banca lleva la cuenta.',
      'Cuando quiera. Siempre que quiera pronto.',
    ],
    uneasy: [
      'Silencio. Una mesa callada me incomoda.',
      'Sin manos no se salda nada.',
      'Le observo desde detrás de la máscara.',
      'El reloj de la banca también corre.',
      'Si se duerme, barajaré por usted.',
    ],
    deformed: [
      'Shhh. Oiga cómo respira la baraja.',
      'Quieto. Así. Como una carta bocabajo.',
      'El silencio aquí tiene costuras.',
      'Sigue ahí. Sigo aquí. Barajando.',
      'Respire más bajo. Desordena las cartas.',
    ],
  },
};
