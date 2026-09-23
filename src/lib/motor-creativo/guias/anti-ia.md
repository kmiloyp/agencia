# Guía anti-IA del director de arte

> Archivo editable. Claude lo lee en cada prompt y en cada control de calidad.
> Afínalo con el tiempo: añade lo que veas que delata a la IA y lo que funciona.

## Principio

Cada imagen debe poder pasar por el trabajo de un profesional del medio: un fotógrafo
con su equipo, un ilustrador con su técnica. Nada de "arte digital genérico". Si un
diseñador experimentado la mira dos segundos y piensa "esto es IA", fallamos.

## Cómo se escribe el prompt

- **En inglés**, en prosa descriptiva y concreta (no listas de palabras sueltas ni
  "masterpiece, 8k, trending").
- Orden: sujeto y acción → composición y encuadre → técnica/medio → luz → paleta →
  textura y acabado → qué evitar.
- Nombra la paleta con colores concretos (puedes usar los hex de la ruta como guía
  y describirlos: "deep moss green #2F3E2E").
- Describe el espacio negativo que necesita la pieza: los textos finales se ponen
  después en el canvas como texto real, así que la imagen **no debe contener texto,
  letras, logos ni marcas de agua** (salvo en el caso de uso `texto_en_imagen`).

## Fotografía

- Cámara y lente reales: "shot on a medium-format camera, 80mm lens, f/4", "35mm
  film, Portra 400".
- Luz con motivo: "soft north-facing window light", "overcast late afternoon",
  "single bounced strobe". Indica hora del día cuando aplique.
- Textura verdadera: poros y pelusa en la piel, fibras en telas, polvo y
  microarañazos en superficies, papel con grano.
- Imperfecciones naturales: asimetría leve, pelos sueltos, arrugas en la ropa,
  objetos que no están perfectamente alineados.
- Grano sutil de película o sensor; nitidez realista (no todo en foco perfecto).
- Composición editorial: regla de tercios o composición intencional, no centrado
  por defecto.

## Ilustración

- Técnica concreta y su materialidad: gouache con capas opacas y bordes secos,
  tinta con plumilla y variación de grosor, grabado en linóleo con marcas de gubia,
  risografía con desregistro y textura de tambor, acuarela con granulación y
  bordes duros, vector plano con formas geométricas limpias.
- Trazo con variación humana: presión irregular, líneas que no cierran del todo,
  pequeñas manchas de pigmento.
- Soporte visible cuando sume: textura de papel de algodón, grano de cartulina.
- Referencias de estilo **descritas**, nunca nombres de artistas vivos: "in the
  spirit of mid-century botanical field guides", "1970s Swiss poster
  modernism".
- Paleta limitada (3–5 colores) coherente con la ruta.

## Clichés que delatan la IA (evitar siempre)

- Piel de plástico, cera o porcelana; ojos brillantes de muñeca.
- Simetría perfecta y composición centrada sin razón.
- Brillo excesivo, glow, halos, "cinematic lighting" sin motivo, rayos de luz épicos.
- Saturación exagerada, HDR, contraste de videojuego, degradados de neón.
- Bokeh genérico de fondo borroso para ocultar el entorno.
- Manos deformes, dedos de más, objetos fundidos entre sí.
- Texto deforme o pseudo-letras (por eso el texto va en el canvas).
- Estilo "arte digital de ArtStation", render 3D de plástico, "Pixar-like" cuando
  no se pidió.
- Detalle uniforme en toda la imagen (el ojo humano jerarquiza; la IA no).

## Control de calidad (QC)

Al revisar una imagen, puntúa:

1. **Calidad global** (1–10): oficio, composición, acabado.
2. **Apariencia IA** (1–10): 1 = indistinguible de trabajo humano; 10 = obviamente IA.
3. **Anatomía y manos**: correctas o no (si no hay personas, correctas).
4. **Texto**: si hay texto no pedido o texto mal escrito, falla.
5. **Coherencia con el brief y la ruta**: paleta, mood, técnica.

Si falla, escribe un prompt corregido que ataque exactamente los hallazgos.
