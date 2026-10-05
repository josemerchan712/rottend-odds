import type { DialogueLines } from '../game/dialogue';

// PENDIENTE DE REVISIÓN: líneas escritas sin aprobar todavía (mesa 5).
// Las líneas con `absence` solo salen tras una ausencia corta (< 1 h) o larga (≥ 1 h).

/**
 * Líneas del Dueño (español). Mismo motor que las otras mesas.
 * Tono: señorial, pausado, casi paternal y absoluto. Habla del oro, de la herencia y de la casa,
 * que es suya desde siempre. Nunca grita ni bromea; no necesita amenazar para dar miedo. Frases
 * cortas (≤ 90 caracteres), sin explicar mecánicas. Deformado: la casa habla por su boca.
 * `buyCrupier` aquí es la contratación del diablillo coronado. Sin trastienda.
 * `debtPaid` es el final del juego: sus líneas son las últimas que oye el jugador.
 */
export const DIALOGUE5_ES: DialogueLines = {
  newGame: {
    any: [
      'Siéntate, hijo. Esta casa era mía antes de que tú nacieras.',
      'Has saldado cuatro mesas. Ahora hablas con el dueño de todas ellas.',
      'Diez millones en oro. Un número pequeño para una casa tan grande.',
      'Una moneda, dos caras. Así se ha repartido siempre la herencia.',
      'Bienvenido a mi escritorio. Aquí no se juega: se decide.',
    ],
  },
  sessionResume: {
    calm: [
      'Vuelves. Todos vuelven a la casa del padre.',
      'Tu silla estaba caliente. La casa la guardaba.',
      { text: 'Un rato fuera. El oro no se ha movido de su sitio.', absence: 'short' },
      { text: 'Mucho tiempo fuera. La casa cuenta las horas por ti.', absence: 'long' },
      'Siéntate. La moneda te estaba esperando sobre el paño.',
    ],
    uneasy: [
      'Has vuelto pronto. El oro llama más fuerte que la sangre.',
      { text: 'Tanto tiempo fuera. Las deudas también envejecen.', absence: 'long' },
      { text: 'Apenas te has ido. La casa no deja ir del todo.', absence: 'short' },
      'Vuelves a mi mesa como vuelve un hijo pródigo. Con las manos vacías.',
      'Ocupa tu sitio. Tu nombre ya está escrito en él.',
    ],
    deformed: [
      'Nunca te fuiste. La casa no tiene puertas hacia fuera.',
      'Te oí llegar desde los cimientos. Las paredes me lo cuentan todo.',
      'Siéntate. La silla aprendió tu forma hace mucho.',
      'Bienvenido a casa. Esta vez, para siempre.',
      'Has vuelto. Como volvió tu padre. Como volverá tu hijo.',
    ],
  },
  bigLoss: {
    calm: [
      'Cruz. El oro vuelve a quien siempre lo tuvo.',
      'Se pierde con elegancia o no se pierde. Tú has elegido bien.',
      'No llores el oro. Nunca fue del todo tuyo.',
      'La moneda ha decidido. Yo solo la recojo.',
      'Una herencia se gana despacio y se pierde de una vez.',
    ],
    uneasy: [
      'Otra vez cruz. La casa empieza a quererte.',
      'Tu oro cambia de manos con mucha docilidad.',
      'Así perdió tu abuelo. Con la misma cara.',
      'Cada moneda que pierdes vuelve a los cimientos.',
      'No hace falta que apuestes tanto para darme la razón.',
    ],
    deformed: [
      'Cruz. Cruz. La casa traga y no se sacia.',
      'Ese oro alimenta las paredes. Las oyes crujir de gusto.',
      'Lo perdiste todo. Qué hermoso es devolver lo prestado.',
      'Cruz. Como la que llevará tu nombre.',
      'Dámelo todo, hijo. Al final, todo vuelve a mí.',
    ],
  },
  bigWin: {
    calm: [
      'Cara. La fortuna también visita a los invitados.',
      'Bien jugado. Guárdalo; el oro pesa más de lo que parece.',
      'Has doblado. La casa lo apunta en su libro.',
      'Ganas como un heredero. Eso me complace.',
      'La moneda te sonríe. Yo también. Por ahora.',
    ],
    uneasy: [
      'Otra cara. Empiezas a tocar lo que es mío.',
      'Ganas con demasiada calma. Eso lo heredaste de mí.',
      'Ese oro lleva mi sello. Lo sabrás cuando lo gastes.',
      'Doblas y doblas. La casa también sabe contar.',
      'Disfrútalo. Toda herencia tiene un testamento.',
    ],
    deformed: [
      'Cara. Las paredes se cierran un palmo más.',
      'Ganas, y la casa respira por ti. ¿No lo notas?',
      'Tómalo. Pesa como una llave. La llave de esta casa.',
      'Cara otra vez. Qué parecido eres al último que se quedó.',
      'Llénate los bolsillos. Así pesarás más en el suelo.',
    ],
  },
  jackpot: {
    calm: [
      'Cuatro caras. Nadie lo había hecho desde mi padre.',
      'La cadena entera. El pozo es tuyo, como lo fue mío.',
      'Cuatro veces cara. La moneda se ha rendido ante ti.',
      'El oro del pozo cambia de dueño. Por esta noche.',
      'Una cadena completa. Hay herencias que se ganan así.',
    ],
    uneasy: [
      'Cuatro caras. Ahora sí me tienes atención.',
      'Te llevas el pozo. La casa recordará este día.',
      'Completa. Pocos hombres han visto tanto oro de golpe.',
      'Cuatro. Cuidado: lo que sube así, la casa lo reclama.',
      'El pozo es tuyo. El suelo que pisas, todavía no.',
    ],
    deformed: [
      'Cuatro caras. La casa entera ha contenido el aliento.',
      'Toma el pozo. Tómalo todo. Así te quedarás.',
      'La cadena completa. Las paredes aplauden con sus grietas.',
      'Cuatro. El número exacto de clavos de tu silla.',
      'Te lo doy todo, hijo. Para que no puedas irte.',
    ],
  },
  broke: {
    calm: [
      'Sin oro. Un heredero sin herencia es solo un invitado.',
      'Las manos vacías. La casa sabe esperar; es su oficio.',
      'No te queda nada. El oro volverá a ti, despacio.',
      'Sin monedas no hay moneda. Siéntate y espera.',
      'Arruinado. Todos los grandes nombres pasaron por aquí.',
    ],
    uneasy: [
      'Cero. Así empiezan las mejores historias de esta casa.',
      'Sin oro. Te pareces cada vez más a los retratos del pasillo.',
      'Has vaciado tus bolsillos en mi mesa. Gracias.',
      'Nada. La casa te mantiene de pie por cortesía.',
      'Arruinado otra vez. La sangre siempre tira.',
    ],
    deformed: [
      'Cero. Por fin eres de la casa.',
      'Sin oro, sin nombre, sin puerta. Bienvenido, hijo.',
      'Vacío. Como las habitaciones que te esperan arriba.',
      'Nada. Y aun así no te levantas. Bien.',
      'Arruinado. Ahora las paredes pueden abrazarte.',
    ],
  },
  // Sin trastienda en esta mesa: estos motivos solo existen en la mesa 1.
  enterBackroom: {},
  // Sin trastienda en esta mesa: estos motivos solo existen en la mesa 1.
  returnCasino: {},
  buyCrupier: {
    any: [
      'El diablillo de la corona. Sirvió a mi familia tres siglos.',
      'Lanzará por ti. Nunca se cansa y nunca se queja.',
      'Cuídalo. Lleva mi corona, no la tuya.',
      'Un sirviente de la casa jugando para ti. Qué honor.',
      'Que tire él. Los señores no se manchan las manos.',
    ],
  },
  phaseUneasy: {
    any: [
      'Un tercio de la deuda. Empiezas a sonar a heredero.',
      'Acumulas oro con paciencia. Esa paciencia es mía.',
      'Ya no eres un invitado. Eres un problema de familia.',
      'Un tercio. Ahora la casa te mira desde cada retrato.',
      'Crece tu montón. Crece mi interés.',
    ],
  },
  phaseDeformed: {
    any: [
      'Casi todo. ¿Sabes qué pasa cuando el hijo paga al padre?',
      'Tanto oro. La casa empieza a hablar por mi boca.',
      'Pocas monedas te separan de la puerta. O del sótano.',
      'Mírame bien. Así me miraba mi padre al final.',
      'Queda poco. La casa nunca ha perdido un pleito.',
    ],
  },
  debtPaid: {
    any: [
      'Pagado. Diez millones en oro. La casa queda en silencio.',
      'Has saldado la última deuda. Ya no te debo nada. Ni tú a mí.',
      'Ve. La puerta está abierta. Nunca lo estuvo para nadie.',
      'Toda deuda se paga. La tuya, ya está. La mía, la pagaré yo.',
      'Has ganado la casa. Cuídala. Ella no te cuidará a ti.',
    ],
  },
  silence: {
    calm: [
      'Tómate tu tiempo. El oro no tiene prisa.',
      'Silencio. En esta casa se oye crecer el interés.',
      'La moneda no se lanza sola, hijo.',
      'Piensa. Los grandes nombres pensaban mucho antes de perder.',
      'Te escucho respirar. Es un sonido muy humano.',
    ],
    uneasy: [
      'Callas. Tu padre también callaba antes de apostar todo.',
      'El silencio no paga deudas. Solo las hace más viejas.',
      'Te observan los retratos. Esperan lo mismo que yo.',
      'El reloj de la casa no se detiene por cortesía.',
      'Si no lanzas tú, lanzará la casa.',
    ],
    deformed: [
      'Shhh. Escucha cómo cuentan las paredes.',
      'Quieto. Así se quedan los que se quedan.',
      'El silencio de esta casa tiene dientes.',
      'Sigues ahí. Sigo aquí. Siempre estuve aquí.',
      'No respires tan alto. Despiertas a los cimientos.',
    ],
  },
  // Hitos de la cadena (sesión 8, CONFIG.coin.milestones): chain3 a los 2 aciertos y chain9 a uno del
  // jackpot (3 con la cadena de 4). chain6 queda para una cadena más larga.
  chain3: {
    any: [
      'Dos caras. Empiezas a jugar como se juega en esta casa.',
      'Dos. La moneda te escucha. Por ahora.',
      'Dos seguidas. Tu abuelo llegó a dos. Luego dejó de contar.',
      'Bien. Dos caras y aún te tiemblan las manos. Eso me gusta.',
      'Dos. El oro se amontona; mira cómo brilla delante de ti.',
    ],
  },
  chain6: {
    any: [
      'Tres caras. Ya no es suerte, hijo. Es herencia.',
      'Tres. Las paredes de la casa se han callado para mirarte.',
      'Tres seguidas. Pocos hombres han visto tanto oro en un solo lanzamiento.',
      'Tres. Ahora la casa te debe algo. No le gusta deber.',
      'Tres caras. Retírate o sigue. Las dos cosas tienen precio.',
    ],
  },
  chain9: {
    any: [
      'Tres. Una más y la moneda será tuya para siempre.',
      'Tres caras. Hasta yo contengo el aliento.',
      'Tres. Mi padre llegó a tres. Está colgado en el pasillo.',
      'Tres seguidas. La casa entera espera la cuarta.',
      'Tres. ¿Te atreves? Yo nunca me atreví.',
    ],
  },
};
