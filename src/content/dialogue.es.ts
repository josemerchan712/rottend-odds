import type { DialogueLines } from '../game/dialogue';

// Revisado y aprobado. Las líneas con `absence` solo salen tras una ausencia corta (< 1 h) o
// larga (≥ 1 h); "volver a la partida" solo se dispara tras al menos 5 minutos reales.

/**
 * Líneas del Encargado (español). Separadas de la lógica por si algún día hay otro idioma.
 * Tono: educado, tranquilo y amenazante; sin gritos ni humor absurdo; frases cortas (≤ 90
 * caracteres); nunca explica mecánicas. En la fase deformada, más rotas y siniestras.
 * Las claves de fase: calm (0-33% de la deuda), uneasy (33-66%), deformed (66-100%) y any.
 */
export const DIALOGUE_ES: DialogueLines = {
  newGame: {
    any: [
      'Llegas puntual. Eso dice mucho de alguien que debe tanto.',
      'Diez millones. Tranquilidad: aquí nadie tiene prisa. Salvo yo.',
      'Ponte a gusto. Vas a pasar aquí más tiempo del que crees.',
      'El casino te da trabajo y tú me pagas. Es un acuerdo muy sencillo.',
      'Te doy la bienvenida. Las puertas se cierran solas; eso ya lo sabías.',
      'Empezamos desde cero. Bueno, desde menos diez millones.',
    ],
  },
  sessionResume: {
    calm: [
      'Has vuelto. Sabía que no irías muy lejos.',
      'Te estaba esperando. La mesa también.',
      'Me alegra verte. A tu deuda también le alegra.',
      'Siéntate. Nada ha cambiado mientras no estabas.',
      { text: 'Qué rapidez. Casi parece que te gusta este sitio.', absence: 'short' },
    ],
    uneasy: [
      { text: 'Llegas tarde. Lo he apuntado.', absence: 'long' },
      { text: 'Creí que te habías olvidado de mí. No suele pasar.', absence: 'long' },
      'Vuelves. Los que no vuelven me preocupan más.',
      'Tu silla seguía caliente. Me aseguré de ello.',
      { text: 'Has tardado. Yo no me he movido de aquí.', absence: 'long' },
      { text: 'Has tardado. He contado cada segundo.', absence: 'long' },
    ],
    deformed: [
      'Vuelves. Vuelves. Siempre vuelven.',
      'Te oí en la escalera. Te oigo en todas partes.',
      'No te fuiste. Nadie se va. Solo lo parece.',
      'Siéntate. La silla ya sabe tu forma.',
      'Bienv... ya estabas aquí. Siempre estuviste aquí.',
    ],
  },
  bigLoss: {
    calm: [
      'Una pena. El dinero no desaparece; solo cambia de manos.',
      'No te lo tomes a mal. A la mesa no le importas.',
      'Respira. La próxima vez será distinta. Probablemente.',
      'Eso ha dolido. Lo he notado desde aquí.',
      'Qué valentía. Y qué cara.',
    ],
    uneasy: [
      'Otra vez. Empiezo a pensar que lo haces por mí.',
      'Ese dinero ya era mío. Solo lo has traído antes.',
      'Cuidado. Cada vez te queda menos que perder.',
      'Sigue así y tendremos que hablar en privado.',
      'La mesa tiene hambre. Y tú la alimentas.',
    ],
    deformed: [
      'Más. Dame más. Dámelo todo.',
      'Lo oigo caer. Me gusta el ruido que hace.',
      'Pierdes, y algo aquí dentro sonríe más.',
      'Todo vuelve a mí. Todo. Tú también.',
      'Bien. Bien. Vacíate.',
    ],
  },
  bigWin: {
    calm: [
      'Enhorabuena. Disfrútalo; no suele durar.',
      'Bonita jugada. Lo anotaré en tu cuenta.',
      'Vaya. Hoy la mesa te mira con buenos ojos.',
      'Ganar sienta bien, ¿verdad? Recuerda esa sensación.',
      'Bien hecho. Cada ficha te acerca a mí.',
    ],
    uneasy: [
      'Ganas. Qué curioso. Lo vigilaré.',
      'No te acostumbres. A la suerte no le gusta la confianza.',
      'Más fichas para mí. Gracias por el esfuerzo.',
      'Sonríes. Yo también. Por motivos distintos.',
      'Bien. Así la caída será más larga.',
    ],
    deformed: [
      'Ganas. Ganas. Y aun así, mío.',
      'Ese brillo en tus manos ya lleva mi nombre.',
      'Ríete. Me gusta oír cómo se rompe una risa.',
      'Más alto. Desde más alto. Más bonito al caer.',
      'Bien, bien, bien. Sigue llenándome.',
    ],
  },
  jackpot: {
    calm: [
      'El Cero Dorado. Hacía tiempo que no lo veía brillar.',
      'Vaya. La casa no suele equivocarse. Hoy lo ha hecho.',
      'Oro. Guárdalo bien. Todo el mundo lo quiere.',
      'Interesante. Eso no estaba en mis cuentas.',
      'Felicidades. Que no se te suba a la cabeza.',
    ],
    uneasy: [
      'El oro siempre encuentra el camino de vuelta a casa.',
      'Tanto brillo atrae miradas. La mía, por ejemplo.',
      'Un golpe de suerte. Los golpes también se devuelven.',
      'Qué rápido creces. Demasiado rápido.',
      'Oro. Lo pesaré cuando sea mío.',
    ],
    deformed: [
      'Oro, oro, oro. Huele a mí.',
      'Brilla como un diente. Como mis dientes.',
      'El cero se ha abierto. Algo ha mirado por él.',
      'Tanto oro. Tan poco tiempo. Tan mío.',
      'Lo guardas. Lo guardas para mí. Qué obediencia.',
    ],
  },
  broke: {
    calm: [
      'Sin fichas. Qué silencio tan honesto.',
      'Vacío. Nos pasa a todos alguna vez. A ti, más.',
      'No queda nada. Pero sigues aquí, y eso vale algo.',
      'Sin fichas, sin prisas. La deuda espera. Yo también.',
      'Los bolsillos vacíos también se llenan. Con esfuerzo.',
    ],
    uneasy: [
      'Cero. Me gusta esa cifra cuando es tuya.',
      'Nada en las manos. Nada en los bolsillos. Mucho en la cuenta.',
      'Sin nada. Ve a ganarte el pan.',
      'Vacío. Lo vacío es lo más fácil de llenar.',
      'Sin fichas. Así es como mejor se te ve.',
    ],
    deformed: [
      'Nada. Nada. Ya no te queda nada más que yo.',
      'Vacío por fuera. ¿Y por dentro? Déjame ver.',
      'Cero. Cero. Un agujero. Cabes en él.',
      'Sin fichas. Págame con otra cosa.',
      'Hueco. Suenas a hueco cuando caminas.',
    ],
  },
  enterBackroom: {
    calm: [
      'Ve, ve. Alguien tiene que hacerlo.',
      'La trastienda te sienta bien. Es tu sitio, por ahora.',
      'No tardes. Te echaré de menos. A ti y a tus fichas.',
      'Mantén limpio el suelo. Aquí cuidamos los detalles.',
      'Un poco de trabajo honrado. Qué refrescante.',
    ],
    uneasy: [
      'Te escondes atrás. Las paredes también me cuentan cosas.',
      'Ve. Recoge. No mires dentro de los cubos.',
      'Ahí atrás también te veo. No lo olvides.',
      'Trabaja. El sudor también cuenta como pago.',
      'La trastienda tiene buena memoria. Como yo.',
    ],
    deformed: [
      'Ahí atrás hay cosas que no recogerías si las vieras.',
      'Agáchate. Agáchate más. Así.',
      'Los cubos respiran. No los despiertes.',
      'Ve. La puerta recuerda quién entra.',
      'Recoge lo que queda de los otros.',
    ],
  },
  returnCasino: {
    calm: [
      'De vuelta. La mesa te ha guardado el sitio.',
      'Hueles a trabajo. Me gusta.',
      'Has vuelto. Justo a tiempo para perder algo.',
      'Las manos sucias apuestan igual de bien.',
      'Ya estás aquí. La ruleta se impacientaba.',
    ],
    uneasy: [
      'Vuelves con poco. Siempre vuelves con poco.',
      '¿Eso es todo lo que traes? Ya veremos.',
      'La mesa no ha dejado de girar mientras no estabas.',
      'Has vuelto. La mesa no te ha echado de menos. Yo sí.',
      'Siéntate. Tenemos cuentas pendientes. Muchas.',
    ],
    deformed: [
      'Vuelves con algo pegado a la espalda. No te gires.',
      'Te esperaba. Te esperaba. Te esperaba.',
      'La rueda ha dicho tu nombre. Dos veces.',
      'Cada vez que vuelves queda menos de ti.',
      'Siéntate. Más cerca. Más.',
    ],
  },
  buyCrupier: {
    any: [
      'Un ayudante. Qué detalle. Así no tendrás que mirar.',
      'Manos ajenas. Muy propio de quien debe tanto.',
      'Ahora el brazo juega por ti. Espero que te fíes de él.',
      'Buena compra. El brazo nunca se cansa. Ni se queja.',
      'Delegar. Una costumbre muy de esta casa.',
    ],
  },
  phaseUneasy: {
    any: [
      'Un tercio. Empiezas a ponerte interesante.',
      'Vas reuniendo. Me alegra, de una forma que no entenderías.',
      'Ya no eres un número más. Eres un número que crece.',
      'Te veo progresar. Te veo muy de cerca.',
      'Un tercio del camino. Lo difícil es el resto.',
    ],
  },
  phaseDeformed: {
    any: [
      'Casi. Casi. ¿Sabes qué pasa cuando alguien casi lo consigue?',
      'Tanto dinero junto. Me cuesta estarme quieto.',
      'Huele a final. Me encanta ese olor.',
      'Ya falta poco. Para los dos.',
      'Mírame bien. Así me pongo cuando alguien está a punto de pagar.',
    ],
  },
  debtPaid: {
    any: [
      'Pagado. Puedes irte. Si encuentras la salida.',
      'Diez millones. Exactos. Qué pena que se acabe.',
      'Estamos en paz. Por ahora. Abajo te esperan otros.',
      'Has cumplido. Pocos lo hacen. Menos aún salen.',
      'Gracias. De verdad. Cobrarte ha sido un placer.',
    ],
  },
  silence: {
    calm: [
      '¿Sigues ahí? El tiempo también cuesta dinero.',
      'Cuánto silencio. Yo también sé esperar.',
      'La mesa se aburre. Y cuando se aburre, cobra.',
      'Pensar mucho tampoco sale gratis.',
      'Tómate tu tiempo. Lo estoy apuntando.',
    ],
    uneasy: [
      'Silencio. Me pone nervioso tu silencio.',
      'Sin moverte no pagas. Lo sabes, ¿verdad?',
      'Te miro. Llevo un rato mirándote.',
      'El reloj corre. El interés también.',
      'Si te duermes, lo notaré.',
    ],
    deformed: [
      'Shhh. Escucha. Las fichas respiran.',
      'No te muevas. Así. Así te veo mejor.',
      'El silencio aquí dentro tiene dientes.',
      'Sigues ahí. Sigo aquí. Seguimos.',
      'Respira más bajo. Me distraes.',
    ],
  },
  // Hitos de la cadena: solo existen en la mesa 5.
  chain3: {},
  chain6: {},
  chain9: {},
};
