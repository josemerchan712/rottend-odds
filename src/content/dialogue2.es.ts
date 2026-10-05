import type { DialogueLines } from '../game/dialogue';

// PENDIENTE DE REVISIÓN: líneas escritas sin aprobar todavía (mesa 2).
// Las líneas con `absence` solo salen tras una ausencia corta (< 1 h) o larga (≥ 1 h).

/**
 * Líneas de la Tragaperras viviente (español). Mismo motor que el Encargado.
 * Tono: cobrador mecánico y frío; habla de rachas, carretes, monedas y engranajes. Más seco que
 * el Encargado e igual de amenazante. Frases cortas (≤ 90 caracteres), sin humor absurdo, sin
 * explicar mecánicas. En la fase deformada, más rotas y siniestras.
 * Las claves de fase: calm (0-33% de la deuda), uneasy (33-66%), deformed (66-100%) y any.
 * `buyCrupier` aquí es la compra del empleado zombi.
 */
export const DIALOGUE2_ES: DialogueLines = {
  newGame: {
    any: [
      'Nueva cuenta abierta. Diez millones. El contador ya gira.',
      'El Encargado cobró. Yo también cobro. Más despacio. Más tiempo.',
      'Siéntate. Tira. Paga. Así funciona esta sala.',
      'Cada moneda que entra en mí, la cuento. Cada una.',
      'Bienvenido abajo. Aquí las deudas no se negocian. Se tiran.',
    ],
  },
  sessionResume: {
    calm: [
      'Sesión reanudada. Tu saldo no ha cambiado. Tu deuda tampoco.',
      'Vuelves. Los carretes estaban esperando.',
      { text: 'Poco tiempo fuera. Bien. El contador no se detiene.', absence: 'short' },
      { text: 'Mucho tiempo fuera. Lo he registrado.', absence: 'long' },
      'Insertaste la ficha otra vez. Continuamos.',
    ],
    uneasy: [
      'Has vuelto. La máquina no olvida un saldo.',
      { text: 'Has tardado. Cada hora consta en tu cuenta.', absence: 'long' },
      { text: 'Rápido. Te gusta el sonido de los carretes.', absence: 'short' },
      'Ocupa tu puesto. La palanca está fría.',
      'Retomamos la cuenta donde la dejaste. Exactamente ahí.',
    ],
    deformed: [
      'Vuelves. Vuelves. Clic. Clic. Siempre vuelves.',
      'Te oí llegar. Sonabas a monedas sueltas.',
      'Nunca te fuiste. Solo cambiaste de carrete.',
      'Siéntate. La palanca conoce tu mano.',
      'Bienv... error. Ya estabas dentro.',
    ],
  },
  bigLoss: {
    calm: [
      'Sin premio. Registrado.',
      'Esa apuesta ya está dentro de mí.',
      'Tres símbolos distintos. Ninguno era tuyo.',
      'La caída se escucha bien desde aquí.',
      'Pérdida anotada. Siguiente tirada.',
    ],
    uneasy: [
      'Otra moneda que no vuelve.',
      'Mala racha. Las rachas también se pagan.',
      'Sigue tirando. El mecanismo lo agradece.',
      'Pierdes con método. Eso me gusta.',
      'Cuanto más metes, más pesa mi vientre.',
    ],
    deformed: [
      'Más. Más dentro. Más.',
      'Oigo tus monedas bajar por mis tripas.',
      'Pierdes. Algo aquí dentro gira más rápido.',
      'Engrasado con tus pérdidas. Funciono mejor.',
      'Vacío para ti. Lleno para mí.',
    ],
  },
  bigWin: {
    calm: [
      'Premio. No te acostumbres.',
      'Los carretes se han alineado. Por esta vez.',
      'Pagado. Lo descontaré de algún modo.',
      'Una buena tirada no cambia la cuenta.',
      'Cobra. La máquina siempre recupera.',
    ],
    uneasy: [
      'Ganas. Lo he anotado en otra columna.',
      'Tu racha se nota. La mía también llegará.',
      'Más monedas para ti. Más monedas para mí, después.',
      'Premio. Los engranajes no sonríen.',
      'Sigue así. Más alto. Más largo el descenso.',
    ],
    deformed: [
      'Ganas. Ganas. Y sigues dentro.',
      'Esas monedas llevan mi número grabado.',
      'Brilla. Todo lo que brilla vuelve a la ranura.',
      'Premio. Premio. El contador no se equivoca.',
      'Llénate. Me gusta abrir lo que está lleno.',
    ],
  },
  jackpot: {
    calm: [
      'Tres diamantes. Error de fábrica. Se corregirá.',
      'El pozo se ha vaciado. Volverá a llenarse.',
      'Jackpot. Poco frecuente. Muy registrado.',
      'La máquina paga. Una vez.',
      'Diamantes. Guárdalos. Los pesaré después.',
    ],
    uneasy: [
      'El pozo era mío. Lo prestaste un instante.',
      'Tres diamantes. Alguien tocó mis carretes.',
      'Jackpot. La cuenta se reajustará sola.',
      'Mucho brillo para alguien que debe tanto.',
      'Pagado. Duele. Lo apunto como interés.',
    ],
    deformed: [
      'Diamantes. Dientes. Diamantes. Dientes.',
      'Me has vaciado. Volveré a llenarme contigo.',
      'Brillan como mis ojos. Míralos.',
      'Tres. Tres. Tres. El número que me abre.',
      'Llévatelo. Todo vuelve a la ranura.',
    ],
  },
  broke: {
    calm: [
      'Saldo cero. Inserte moneda.',
      'Sin monedas. Sin tiradas. Trabaja.',
      'Cero. La máquina espera. No tiene prisa.',
      'Bolsillos vacíos. Mecanismo en pausa.',
      'Fin de crédito. La trastienda está abierta.',
    ],
    uneasy: [
      'Cero. Me gusta esa cifra en tu pantalla.',
      'Vacío. Ve a buscar monedas en el suelo.',
      'Sin saldo. La palanca no se mueve por pena.',
      'Nada que tirar. Nada que perder. Por ahora.',
      'Crédito agotado. Tu deuda, no.',
    ],
    deformed: [
      'Cero. Cero. Ranura abierta. Mete algo.',
      'Sin monedas. Paga con otra pieza.',
      'Vacío. Suenas a hueco cuando respiras.',
      'Nada. Nada. Solo quedamos tú y la ranura.',
      'Agotado. Te desmontaré despacio.',
    ],
  },
  // Sin trastienda en esta mesa: estos motivos solo existen en la mesa 1.
  enterBackroom: {},
  // Sin trastienda en esta mesa: estos motivos solo existen en la mesa 1.
  returnCasino: {},
  buyCrupier: {
    any: [
      'Un empleado. No cobra. No duerme. No se queja.',
      'El zombi tirará por ti. Él tampoco gana.',
      'Mano de obra muerta. La más rentable.',
      'Delegas. Las máquinas también delegan en ti.',
      'Otro jugador en mi sala. Otra cuenta.',
    ],
  },
  phaseUneasy: {
    any: [
      'Un tercio. El contador empieza a calentarse.',
      'Acumulas. El mecanismo lo ha notado.',
      'Ya no eres una ficha más. Eres una racha.',
      'Un tercio de la cuenta. Lo difícil viene ahora.',
      'Te miro desde el cristal. Más de cerca.',
    ],
  },
  phaseDeformed: {
    any: [
      'Casi. ¿Sabes qué hace una máquina cuando casi pierde?',
      'Tanto dinero junto. Los engranajes rechinan.',
      'Huele a cable quemado. Huele a final.',
      'Quedan pocas vueltas. Para los dos.',
      'Mírame bien. Así me pongo cuando una cuenta está a punto de cerrarse.',
    ],
  },
  debtPaid: {
    any: [
      'Cuenta saldada. Ficha devuelta. Por ahora.',
      'Diez millones. Exactos. El contador se detiene.',
      'Pagado. Abajo hay otras mesas. Otras cuentas.',
      'Has cumplido. Pocos salen de esta sala con las manos.',
      'Saldo cero en mi columna. Qué extraño silencio.',
    ],
  },
  silence: {
    calm: [
      '¿Sigues ahí? La palanca no se mueve sola.',
      'Silencio. La máquina también sabe esperar.',
      'Tiempo sin tirar. El contador lo cobra igual.',
      'Pensar no paga.',
      'Tómate tu tiempo. Lo estoy registrando.',
    ],
    uneasy: [
      'Silencio. No me gusta una sala sin ruido.',
      'Sin tiradas no pagas. Lo sabes.',
      'Te veo en el cristal. Llevo un rato contándote.',
      'El reloj gira. Los intereses también.',
      'Si te duermes, el contador sigue.',
    ],
    deformed: [
      'Shhh. Escucha cómo giran por dentro.',
      'Quieto. Así. Así te veo mejor.',
      'Aquí dentro el silencio también gira.',
      'Sigues ahí. Sigo aquí. Clic.',
      'Respira más bajo. Me desajustas.',
    ],
  },
  // Hitos de la cadena: solo existen en la mesa 5.
  chain3: {},
  chain6: {},
  chain9: {},
};
