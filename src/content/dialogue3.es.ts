import type { DialogueLines } from '../game/dialogue';

// PENDIENTE DE REVISIÓN: líneas escritas sin aprobar todavía (mesa 3).
// Las líneas con `absence` solo salen tras una ausencia corta (< 1 h) o larga (≥ 1 h).

/**
 * Líneas del Barman (español). Mismo motor que el Encargado y la Tragaperras viviente.
 * Tono: barman educado y servil que limpia vasos sin parar; habla de copas, rondas, dados,
 * cuentas pendientes y lo que se sirve en su barra. Amable por fuera, cruel por debajo. Frases
 * cortas (≤ 90 caracteres), sin humor absurdo, sin explicar mecánicas. Deformado: roto y hambriento.
 * `buyCrupier` aquí es la contratación del camarero fantasma.
 */
export const DIALOGUE3_ES: DialogueLines = {
  newGame: {
    any: [
      'Bienvenido a mi barra. Aquí la primera ronda la pagas tú. Y las demás.',
      'Diez millones en chapas. Sírvete. Tenemos toda la noche.',
      'Los dados están limpios. Los vasos, no tanto. Siéntate.',
      'Arriba pagaste a la máquina. Aquí me pagas a mí. Con calma.',
      'Te pongo lo de siempre: una deuda bien larga.',
    ],
  },
  sessionResume: {
    calm: [
      'Has vuelto. Te guardé el taburete.',
      'Tu vaso seguía aquí. Sucio, como lo dejaste.',
      { text: 'Poco rato fuera. La barra apenas se ha enfriado.', absence: 'short' },
      { text: 'Has tardado. Apunté cada ronda que no pediste.', absence: 'long' },
      'Bienvenido otra vez. La cuenta sigue abierta.',
    ],
    uneasy: [
      'Volviste. Siempre vuelven a la barra.',
      { text: 'Mucho tiempo fuera. La cuenta ha crecido sola.', absence: 'long' },
      { text: 'Qué pronto. Te gusta cómo suenan los dados.', absence: 'short' },
      'Siéntate. He limpiado este vaso cien veces esperándote.',
      'La casa no olvida a sus clientes. Ni lo que deben.',
    ],
    deformed: [
      'Vuelves. Vuelves. La barra te tenía hambre.',
      'Te oí llegar. Sonabas a cristal roto.',
      'Nunca saliste. Solo fuiste al baño un rato muy largo.',
      'Siéntate. El taburete ya tiene tu forma.',
      'Bienv... no. Tú nunca te fuiste de aquí.',
    ],
  },
  bigLoss: {
    calm: [
      'Mala tirada. Lo apunto en tu cuenta.',
      'Los dados no tienen memoria. Yo sí.',
      'Esa ronda la invitas tú. Gracias.',
      'Se te ha ido de las manos. Pasa en las mejores familias.',
      'Una pena. Te pongo otra, por si acaso.',
    ],
    uneasy: [
      'Otra vez. Empiezo a disfrutar de servirte.',
      'Cada chapa que pierdes acaba en mi caja.',
      'Tiras como quien no tiene a nadie esperando.',
      'Cuidado. Los vasos vacíos se rompen con facilidad.',
      'Se acabó la ronda. La cuenta, no.',
    ],
    deformed: [
      'Más. Sírvemelo todo. Hasta la última chapa.',
      'Oigo cómo se te cae el dinero. Suena a hielo.',
      'Pierdes. Algo detrás de la barra se relame.',
      'Todo acaba en mi caja. Tú también.',
      'Vacía el vaso. Vacíate tú.',
    ],
  },
  bigWin: {
    calm: [
      'Buena tirada. Esta ronda va por la casa. Mentira.',
      'Enhorabuena. Disfrútalo antes de que se caliente.',
      'Los dados te quieren hoy. A mí no me engañan.',
      'Ganas. Te limpio el vaso, por la costumbre.',
      'Brindemos. Con tu dinero, naturalmente.',
    ],
    uneasy: [
      'Ganas. Lo he apuntado en otra columna.',
      'Mucha suerte para alguien que debe tanto.',
      'Más chapas para ti. Más vasos que lavar para mí.',
      'Sonríes. Yo también. Por razones distintas.',
      'Bien. Así pagarás la próxima ronda con gusto.',
    ],
    deformed: [
      'Ganas. Ganas. Y sigues sentado en mi barra.',
      'Esas chapas ya llevan mi marca.',
      'Ríete. Me gusta el sonido antes del cristal roto.',
      'Llénate el vaso. Lo vaciaré yo.',
      'Bien, bien. Engorda la cuenta para mí.',
    ],
  },
  jackpot: {
    calm: [
      'Tres dobles seises. Hacía años que no lo veía.',
      'Vaya. El pozo se ha vaciado. Habrá que volver a llenarlo.',
      'Seis y seis, tres veces. Alguien te quiere ahí arriba.',
      'Felicidades. La casa invita a una ronda. Una.',
      'Guárdalo bien. En esta barra se pierden cosas.',
    ],
    uneasy: [
      'El pozo era mío. Te lo he prestado.',
      'Tres dobles seises. Los dados me deben una explicación.',
      'Tanto brillo atrae miradas. Las mías, sobre todo.',
      'Un golpe de suerte. Los golpes se devuelven.',
      'Cobra. Ya me lo cobraré yo después.',
    ],
    deformed: [
      'Seis. Seis. Seis. Seis. Seis. Seis.',
      'Me has vaciado el pozo. Te vaciaré a ti.',
      'Doce y doce y doce. Cuento tus dientes.',
      'Llévatelo. Todo vuelve a la barra.',
      'Tres dobles. Tres. El número exacto de tus costillas sueltas.',
    ],
  },
  broke: {
    calm: [
      'Sin chapas. La barra no fía. Casi nunca.',
      'Vacío. Ve a la trastienda; hay vasos que recoger.',
      'No queda nada. Pero la noche es larga.',
      'Bolsillos vacíos. Te pongo agua. Del grifo.',
      'Sin chapas, sin rondas. Así funciona esto.',
    ],
    uneasy: [
      'Cero. Me gusta esa cifra en tu cuenta.',
      'Nada en la mano. Mucho en la pizarra.',
      'Sin chapas. Friega algo y hablamos.',
      'Vacío. Lo vacío se llena con trabajo. O con otra cosa.',
      'Sin nada. Así es como mejor me escuchas.',
    ],
    deformed: [
      'Nada. Nada. Solo quedamos tú y la barra.',
      'Vacío. Págame con lo que llevas dentro.',
      'Cero. Un vaso sin fondo. Cabes en él.',
      'Sin chapas. Tienes dedos. Tienes dientes.',
      'Hueco. Suenas a botella vacía cuando respiras.',
    ],
  },
  enterBackroom: {
    calm: [
      'Ve, ve. Las copas no se recogen solas.',
      'Detrás hay vasos sucios. Y alguna propina olvidada.',
      'Trabajo honrado. Qué refrescante.',
      'Cuidado con los cristales. Cortan más de lo que parece.',
      'La trastienda también da de comer. Poco.',
    ],
    uneasy: [
      'Ve atrás. No pruebes lo que queda en los vasos.',
      'Recoge. No mires debajo del fregadero.',
      'Ahí detrás también te veo. Por el espejo.',
      'Friega. El sudor también cuenta como pago.',
      'Las botellas vacías cuentan cosas. No las escuches.',
    ],
    deformed: [
      'Ahí detrás hay dientes que no son de nadie.',
      'Agáchate. Más. Recoge lo que quedó de los otros.',
      'Los vasos respiran. No los despiertes.',
      'Ve. La puerta de atrás no olvida una cara.',
      'Friega hasta que te sangren las manos.',
    ],
  },
  returnCasino: {
    calm: [
      'De vuelta. Tu taburete sigue caliente.',
      'Manos limpias. Bien. Tira.',
      'Traes chapas. Me alegra verte.',
      'Ya estás aquí. Los dados te echaban de menos.',
      'Siéntate. Te pongo otra.',
    ],
    uneasy: [
      'Traes poco. Nunca traes suficiente.',
      '¿Eso es todo? La barra tiene sed.',
      'Los dados no han parado mientras fregabas.',
      'Siéntate. La pizarra ha seguido sumando.',
      'Vuelves a mi barra. Como todos.',
    ],
    deformed: [
      'Vuelves oliendo a lejía. Me encanta.',
      'Te esperaba. Te esperaba. Limpiando.',
      'Los dados han dicho tu nombre. Dos veces seis.',
      'Cada ronda queda menos de ti en el vaso.',
      'Acércate. Más. Apoya la cara en la barra.',
    ],
  },
  buyCrupier: {
    any: [
      'Un camarero nuevo. No cobra. No respira. No se queja.',
      'El fantasma tirará por ti. Él ya no tiene nada que perder.',
      'Buen chico. Sirvió aquí muchos años. Sigue sirviendo.',
      'Delegas. Muy propio de quien debe tanto.',
      'Otra alma en mi barra. Otra cuenta.',
    ],
  },
  phaseUneasy: {
    any: [
      'Un tercio de la cuenta. Empiezas a interesarme.',
      'Vas reuniendo. La pizarra se pone nerviosa.',
      'Ya no eres un cliente más. Eres un cliente que paga.',
      'Te veo progresar. Desde muy cerca.',
      'Un tercio. Lo difícil es el último trago.',
    ],
  },
  phaseDeformed: {
    any: [
      'Casi. ¿Sabes qué pasa con el último trago?',
      'Tantas chapas juntas. Me tiemblan los vasos.',
      'Huele a cierre. Me encanta ese olor.',
      'Queda poco para la última ronda. Para los dos.',
      'Mírame bien. Así sonrío cuando alguien va a cerrar su cuenta.',
    ],
  },
  debtPaid: {
    any: [
      'Cuenta saldada. Borro la pizarra. Por ahora.',
      'Diez millones en chapas. Exactos. Qué pena.',
      'Pagado. Más abajo hay otras mesas. Otros cobradores.',
      'Has cumplido. Pocos salen de mi barra por su propio pie.',
      'Gracias por la visita. La casa siempre recuerda.',
    ],
  },
  silence: {
    calm: [
      '¿Otra? La barra no se paga sola.',
      'Cuánto silencio. Paso el trapo mientras tanto.',
      'Los dados se aburren. Y cuando se aburren, muerden.',
      'Pensarlo tanto también se cobra.',
      'Tómate tu tiempo. Yo limpio vasos.',
    ],
    uneasy: [
      'Silencio. No me gusta una barra callada.',
      'Sin tiradas no se paga la cuenta.',
      'Te miro por el espejo. Hace un rato.',
      'La pizarra suma aunque no tires.',
      'Si te duermes en mi barra, te despierto yo.',
    ],
    deformed: [
      'Shhh. Escucha cómo tiemblan los vasos.',
      'Quieto. Así. Como un vaso en la estantería.',
      'Aquí dentro el silencio también bebe.',
      'Sigues ahí. Sigo aquí. Sirviendo.',
      'Respira más bajo. Empañas el cristal.',
    ],
  },
};
