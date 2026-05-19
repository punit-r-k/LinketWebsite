export const SUPPORTED_LOCALES = ["en", "es", "pt"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "en";
export const LOCALE_COOKIE_NAME = "linket_locale";
export const LOCALE_SOURCE_COOKIE_NAME = "linket_locale_source";
export const LOCALE_STORAGE_KEY = "linket:locale";

export type LocaleSource = "manual" | "detected";

export type LocaleOption = {
  code: SupportedLocale;
  label: string;
  nativeLabel: string;
  htmlLang: string;
};

export const LOCALE_OPTIONS: readonly LocaleOption[] = [
  { code: "en", label: "English", nativeLabel: "English", htmlLang: "en" },
  { code: "es", label: "Spanish", nativeLabel: "Español", htmlLang: "es" },
  {
    code: "pt",
    label: "Portuguese",
    nativeLabel: "Português",
    htmlLang: "pt",
  },
] as const;

const PORTUGUESE_COUNTRIES = new Set([
  "AO",
  "BR",
  "CV",
  "GW",
  "MO",
  "MZ",
  "PT",
  "ST",
  "TL",
]);

const SPANISH_COUNTRIES = new Set([
  "AR",
  "BO",
  "CL",
  "CO",
  "CR",
  "CU",
  "DO",
  "EC",
  "ES",
  "GQ",
  "GT",
  "HN",
  "MX",
  "NI",
  "PA",
  "PE",
  "PR",
  "PY",
  "SV",
  "UY",
  "VE",
]);

type LocaleUiCopy = {
  languageSwitcher: {
    ariaLabel: string;
    label: string;
  };
  onboarding: {
    stepPrefix: string;
    stepOf: string;
    language: {
      stepLabel: string;
      stepDescription: string;
      pageTitle: string;
      pageDescription: string;
      cardTitle: string;
      cardDescription: string;
      helper: string;
      continuePrefix: string;
      selectedBadge: string;
      detectedBadge: string;
      options: Record<SupportedLocale, { title: string; description: string }>;
    };
  };
};

type LocaleDictionary = {
  code: SupportedLocale;
  htmlLang: string;
  ui: LocaleUiCopy;
  phrases: Record<string, string>;
};

const esPhrases: Record<string, string> = {
  "Skip to content": "Saltar al contenido",
  Pricing: "Precios",
  Customization: "Personalización",
  FAQ: "Preguntas frecuentes",
  "Get Started": "Empezar",
  "Get started": "Empezar",
  "Log in": "Iniciar sesión",
  Login: "Iniciar sesión",
  Menu: "Menú",
  Privacy: "Privacidad",
  Terms: "Términos",
  Security: "Seguridad",
  Accessibility: "Accesibilidad",
  Warranty: "Garantía",
  Legal: "Legal",
  Contact: "Contacto",
  "Stay Connected.": "Sigue conectado.",
  "All rights reserved.": "Todos los derechos reservados.",
  "Don't just share it...": "No solo lo compartas...",
  "Don't just share it... LINKET!": "No solo lo compartas... LINKET!",
  "Linket keychains share your digital profile instantly with NFC and QR backed by live editing.":
    "Los llaveros Linket comparten tu perfil digital al instante con NFC y QR, respaldados por edición en vivo.",
  "Linket Connect | NFC keychains, digital profiles, and lead capture":
    "Linket Connect | Llaveros NFC, perfiles digitales y captura de prospectos",
  "Linket Connect combines NFC keychains, live digital profiles, and built-in lead capture so students, creators, and teams can share contact info, update links instantly, and track every scan.":
    "Linket Connect combina llaveros NFC, perfiles digitales en vivo y captura de prospectos integrada para que estudiantes, creadores y equipos compartan contactos, actualicen enlaces al instante y midan cada escaneo.",
  "Linket Connect | NFC keychains and live digital profiles":
    "Linket Connect | Llaveros NFC y perfiles digitales en vivo",
  "Share contact info with one tap, keep your profile current, and capture leads with NFC + QR hardware built for students, creators, and teams.":
    "Comparte tu contacto con un toque, mantén tu perfil actualizado y captura prospectos con hardware NFC + QR creado para estudiantes, creadores y equipos.",
  "NFC keychains, live digital profiles, and lead capture that keep every intro current from the first tap onward.":
    "Llaveros NFC, perfiles digitales en vivo y captura de prospectos que mantienen cada presentación actualizada desde el primer toque.",
  "One NFC tap opens your live public profile, lets people save your contact, and drives qualified leads into your dashboard. Update once, and every future scan shares your latest info.":
    "Un toque NFC abre tu perfil público en vivo, permite guardar tu contacto y lleva prospectos calificados a tu panel. Actualiza una vez y cada escaneo futuro comparte tu información más reciente.",
  "Leads collected": "Prospectos captados",
  Scans: "Escaneos",
  "Conversion rate": "Tasa de conversión",
  "Active Linkets": "Linkets activos",
  "New": "Nuevo",
  Yesterday: "Ayer",
  "3 days ago": "Hace 3 días",
  "Followed up": "Seguimiento hecho",
  "1 week ago": "Hace 1 semana",
  "What Is Linket?": "¿Qué es Linket?",
  "Interactive networking made seamless":
    "Networking interactivo sin fricción",
  "Linket combines your physical tap-to-share hardware to your live page, keeping your leads organized.":
    "Linket conecta tu hardware físico de toque para compartir con tu página en vivo y mantiene tus prospectos organizados.",
  "Instead of handing over a static card, Linket gives you a physical product that opens a living digital introduction. The person you meet can save your contact, open your key links, and get a cleaner sense of what you do in seconds, while you gain insight and keep control of what they see after the conversation.":
    "En lugar de entregar una tarjeta estática, Linket te da un producto físico que abre una presentación digital viva. La persona que conoces puede guardar tu contacto, abrir tus enlaces clave y entender lo que haces en segundos, mientras tú obtienes información y mantienes el control de lo que ve después de la conversación.",
  "A physical tap": "Un toque físico",
  "A live public page": "Una página pública en vivo",
  "Follow-up tools behind it": "Herramientas de seguimiento detrás",
  "A tap or scan opens your page instantly, so the first handoff feels natural in person without asking anyone to download an app.":
    "Un toque o escaneo abre tu página al instante, para que el primer intercambio se sienta natural en persona sin pedir que descarguen una app.",
  "That tap opens a branded page with your photo, headline, contact save, and key links, giving the other person one clear place to understand who you are.":
    "Ese toque abre una página de marca con tu foto, titular, opción para guardar contacto y enlaces clave, dando a la otra persona un solo lugar claro para entender quién eres.",
  "You can update the page anytime, capture leads, and review engagement so every introduction stays current and is easier to follow up on.":
    "Puedes actualizar la página cuando quieras, captar prospectos y revisar la interacción para que cada presentación siga vigente y sea más fácil de seguir.",
  "Public Page": "Página pública",
  "This is the founder's": "Esta es la",
  "live page": "página en vivo del fundador",
  "A public page is the live profile people see after they tap your Linket or scan your QR code. It gives them one clean place to save your contact, open your key links, and understand who you are in seconds.":
    "Una página pública es el perfil en vivo que las personas ven después de tocar tu Linket o escanear tu código QR. Les da un lugar claro para guardar tu contacto, abrir tus enlaces clave y entender quién eres en segundos.",
  "What Lives Here": "Qué vive aquí",
  "Why It Matters": "Por qué importa",
  "Your photo, headline, email, contact save button, and important links all stay in one place so the other person knows exactly where to go next.":
    "Tu foto, titular, correo, botón para guardar contacto y enlaces importantes están en un solo lugar para que la otra persona sepa exactamente qué hacer después.",
  "Instead of sending people to scattered apps and stale links, every tap opens a current, branded page that feels credible and easy to act on.":
    "En vez de enviar a las personas a apps dispersas y enlaces desactualizados, cada toque abre una página actual, con marca, creíble y fácil de usar.",
  "Custom orders": "Pedidos personalizados",
  "Work with us to design custom made Linkets for your":
    "Trabaja con nosotros para diseñar Linkets personalizados para tu",
  team: "equipo",
  "Work directly with our hardware team to design custom models that match your brand. We handle prototyping, sourcing, and rollout so you can stay focused on demos.":
    "Trabaja directamente con nuestro equipo de hardware para diseñar modelos personalizados que coincidan con tu marca. Nosotros gestionamos prototipos, abastecimiento y despliegue para que puedas enfocarte en las demostraciones.",
  "UV-resistant plastic that holds up to daily wear":
    "Plástico resistente a rayos UV para el uso diario",
  "Custom models shaped around your logo or brand mark":
    "Modelos personalizados con la forma de tu logo o marca",
  "Customizable public pages that stay on brand":
    "Páginas públicas personalizables que mantienen tu marca",
  "Lead capture tools with analytics for follow-ups":
    "Herramientas de captura de prospectos con analítica para seguimiento",
  "Get in touch": "Ponte en contacto",
  "Unlock the full Linket experience with our custom team.":
    "Desbloquea la experiencia completa de Linket con nuestro equipo personalizado.",
  "Work email": "Correo laboral",
  "Team size": "Tamaño del equipo",
  Notes: "Notas",
  "Share timelines or hardware goals...":
    "Comparte plazos u objetivos de hardware...",
  "Book your consult": "Agenda tu consulta",
  "Request sent": "Solicitud enviada",
  "We will get back to you as soon as possible.":
    "Te responderemos lo antes posible.",
  "Please enter a valid work email.":
    "Ingresa un correo laboral válido.",
  "Please share your team size.": "Comparte el tamaño de tu equipo.",
  "Please add a few notes so we can prepare.":
    "Agrega unas notas para que podamos prepararnos.",
  "We will reach out within one business day.":
    "Te contactaremos dentro de un día hábil.",
  "Something went wrong": "Algo salió mal",
  "Linket plans": "Planes de Linket",
  Individual: "Individual",
  Business: "Empresa",
  "Individual options": "Opciones individuales",
  "Choose free web-only, paid web-only, or web + Linket bundle.":
    "Elige web gratis, web de pago o paquete web + Linket.",
  "Business options": "Opciones para empresas",
  "Choose standard business Linkets or book a consult to customize a design.":
    "Elige Linkets estándar para empresa o agenda una consulta para personalizar un diseño.",
  "Free Web-Only": "Web gratis",
  "Web + Linket Bundle": "Paquete Web + Linket",
  "Paid Web-Only (Pro)": "Web de pago (Pro)",
  "Start free": "Empezar gratis",
  "Buy bundle": "Comprar paquete",
  "Start monthly": "Empezar mensual",
  "Start yearly": "Empezar anual",
  "Contact sales": "Contactar a ventas",
  "Book a consult": "Agendar consulta",
  "Answers before you tap": "Respuestas antes del toque",
  "Everything you need to know about Linket hardware, profiles, and data.":
    "Todo lo que necesitas saber sobre hardware, perfiles y datos de Linket.",
  "Does Linket work with both iPhone and Android?":
    "¿Linket funciona con iPhone y Android?",
  "Do recipients need a Linket or an app?":
    "¿Los destinatarios necesitan un Linket o una app?",
  "Can I update my profile after printing?":
    "¿Puedo actualizar mi perfil después de imprimir?",
  "What is the best-value starter option?":
    "¿Cuál es la opción inicial con mejor valor?",
  "Is data collection privacy-centered?":
    "¿La recopilación de datos está centrada en la privacidad?",
  "Digital business card": "Tarjeta de presentación digital",
  "NFC business card": "Tarjeta de presentación NFC",
  "Link in bio": "Link en bio",
  "Straight answer": "Respuesta directa",
  "Related guides": "Guías relacionadas",
  "View pricing": "Ver precios",
  "See the demo": "Ver demo",
  "See the profile demo": "Ver demo del perfil",
  "Common questions": "Preguntas comunes",
  "Best fit": "Mejor encaje",
  "Profile settings": "Configuración del perfil",
  "Active profiles": "Perfiles activos",
  "Setup unavailable": "Configuración no disponible",
  "Choose language": "Elegir idioma",
  "Choose a language to continue.": "Elige un idioma para continuar.",
  "Loading your setup...": "Cargando tu configuración...",
  "Preparing the fastest path to a live Linket page.":
    "Preparando el camino más rápido hacia una página Linket en vivo.",
  Current: "Actual",
  Done: "Listo",
  Review: "Revisar",
  Next: "Siguiente",
  Later: "Después",
  Profile: "Perfil",
  "Contact card": "Tarjeta de contacto",
  Links: "Enlaces",
  "Review + publish": "Revisar y publicar",
  "Set up your public profile": "Configura tu perfil público",
  "Add the basics now. You can edit everything later.":
    "Agrega lo básico ahora. Puedes editar todo más tarde.",
  "Set up your contact card": "Configura tu tarjeta de contacto",
  "Add the details people save when they download your contact. You can add more later.":
    "Agrega los datos que las personas guardan al descargar tu contacto. Puedes agregar más después.",
  "Add your first link": "Agrega tu primer enlace",
  "Add the main link people should open first.":
    "Agrega el enlace principal que las personas deben abrir primero.",
  "Review and publish": "Revisa y publica",
  "Check your page once, then go live.":
    "Revisa tu página una vez y publícala.",
  "Profile photo (optional)": "Foto de perfil (opcional)",
  "Optional for now. Add a photo if you want a stronger first impression.":
    "Opcional por ahora. Agrega una foto si quieres una primera impresión más fuerte.",
  Name: "Nombre",
  "What people will see first.": "Lo primero que verán las personas.",
  "Public URL": "URL pública",
  "Pick a short link to share. This is the link you'll send.":
    "Elige un enlace corto para compartir. Este es el enlace que enviarás.",
  "Pick your link": "Elige tu enlace",
  Unavailable: "No disponible",
  "Pick a short link": "Elige un enlace corto",
  "Checking availability": "Verificando disponibilidad",
  Available: "Disponible",
  "One-line intro": "Introducción de una línea",
  "Keep it short. You can edit later.":
    "Mantenla breve. Puedes editarla después.",
  "This is what gets saved when someone taps Save contact.":
    "Esto es lo que se guarda cuando alguien toca Guardar contacto.",
  "Start with one detail people can use right away.":
    "Empieza con un dato que las personas puedan usar de inmediato.",
  Email: "Correo",
  "Use account email": "Usar correo de la cuenta",
  Optional: "Opcional",
  Phone: "Teléfono",
  Hide: "Ocultar",
  "Phone (optional)": "Teléfono (opcional)",
  "Business details (optional)": "Datos profesionales (opcional)",
  "Add company or job title if you want it saved too.":
    "Agrega empresa o cargo si también quieres guardarlo.",
  "Job title": "Cargo",
  Company: "Empresa",
  "First link": "Primer enlace",
  "Second link": "Segundo enlace",
  "Link label": "Etiqueta del enlace",
  URL: "URL",
  "Add custom label": "Agregar etiqueta personalizada",
  "We'll name the button from the link.":
    "Nombraremos el botón a partir del enlace.",
  "Add another link": "Agregar otro enlace",
  Theme: "Tema",
  "Pick a theme. You can change it later.":
    "Elige un tema. Puedes cambiarlo más tarde.",
  "Free includes Light and Dark. Paid unlocks the full theme library.":
    "Gratis incluye Claro y Oscuro. Pago desbloquea toda la biblioteca de temas.",
  "Paid themes": "Temas de pago",
  "Unlock paid themes": "Desbloquear temas de pago",
  Paid: "Pago",
  "Add your first link first.": "Agrega primero tu primer enlace.",
  "Your public URL": "Tu URL pública",
  Copy: "Copiar",
  Edit: "Editar",
  "Ready to publish": "Listo para publicar",
  "Make sure the essentials are in place before you go live.":
    "Asegúrate de que lo esencial esté listo antes de publicar.",
  "Before you publish": "Antes de publicar",
  "After you publish": "Después de publicar",
  "Check the preview once.": "Revisa la vista previa una vez.",
  "Make sure your first link opens correctly.":
    "Asegúrate de que tu primer enlace abra correctamente.",
  "Review how the page looks on mobile.":
    "Revisa cómo se ve la página en móvil.",
  "Your page goes live at this URL.":
    "Tu página se publica en esta URL.",
  "Your QR becomes available.": "Tu QR queda disponible.",
  "You can still edit the page anytime.":
    "Aún puedes editar la página cuando quieras.",
  Back: "Atrás",
  "Continue to contact info": "Continuar a información de contacto",
  "Continue to links": "Continuar a enlaces",
  "Continue to review": "Continuar a revisión",
  "Publishing...": "Publicando...",
  "Update live page": "Actualizar página en vivo",
  "Publish page": "Publicar página",
  "Live preview": "Vista previa en vivo",
  "This updates as you type.": "Esto se actualiza mientras escribes.",
  "To finish setup": "Para terminar la configuración",
  Status: "Estado",
  "Live status": "Estado en vivo",
  "Next step: continue to the dashboard.":
    "Siguiente paso: continúa al panel.",
  "You're live": "Ya estás en vivo",
  "Your page is live. Next, continue to the dashboard.":
    "Tu página está en vivo. Ahora continúa al panel.",
  "Your live link": "Tu enlace en vivo",
  "Next step": "Siguiente paso",
  "Continue to dashboard": "Continuar al panel",
  "Share your page": "Comparte tu página",
  "Copy link": "Copiar enlace",
  "Open live page": "Abrir página en vivo",
  "Show QR": "Mostrar QR",
  "Keep building": "Seguir construyendo",
  "Pair your Linket": "Vincula tu Linket",
  "Connect your device next.": "Conecta tu dispositivo después.",
  "Set up lead capture": "Configurar captura de prospectos",
  "Open the lead form builder.": "Abrir el creador de formularios.",
  "Share this QR": "Comparte este QR",
  "Scan this on a phone to test your live page or use it in person.":
    "Escanéalo en un teléfono para probar tu página en vivo o usarla en persona.",
};

const ptPhrases: Record<string, string> = {
  "Skip to content": "Pular para o conteúdo",
  "What Is Linket?": "O que é o Linket?",
  Pricing: "Preços",
  Customization: "Personalização",
  FAQ: "Perguntas frequentes",
  "Get Started": "Começar",
  "Get started": "Começar",
  "Log in": "Entrar",
  Login: "Entrar",
  Menu: "Menu",
  Privacy: "Privacidade",
  Terms: "Termos",
  Security: "Segurança",
  Accessibility: "Acessibilidade",
  Warranty: "Garantia",
  Legal: "Legal",
  Contact: "Contato",
  "Stay Connected.": "Continue conectado.",
  "All rights reserved.": "Todos os direitos reservados.",
  "Don't just share it...": "Não apenas compartilhe...",
  "Don't just share it... LINKET!": "Não apenas compartilhe... LINKET!",
  "Linket keychains share your digital profile instantly with NFC and QR backed by live editing.":
    "Os chaveiros Linket compartilham seu perfil digital instantaneamente com NFC e QR, com edição em tempo real.",
  "Linket Connect | NFC keychains, digital profiles, and lead capture":
    "Linket Connect | Chaveiros NFC, perfis digitais e captura de leads",
  "Linket Connect combines NFC keychains, live digital profiles, and built-in lead capture so students, creators, and teams can share contact info, update links instantly, and track every scan.":
    "O Linket Connect combina chaveiros NFC, perfis digitais ao vivo e captura de leads integrada para que estudantes, criadores e equipes compartilhem contatos, atualizem links instantaneamente e acompanhem cada escaneamento.",
  "Linket Connect | NFC keychains and live digital profiles":
    "Linket Connect | Chaveiros NFC e perfis digitais ao vivo",
  "Share contact info with one tap, keep your profile current, and capture leads with NFC + QR hardware built for students, creators, and teams.":
    "Compartilhe contato com um toque, mantenha seu perfil atualizado e capture leads com hardware NFC + QR criado para estudantes, criadores e equipes.",
  "NFC keychains, live digital profiles, and lead capture that keep every intro current from the first tap onward.":
    "Chaveiros NFC, perfis digitais ao vivo e captura de leads que mantêm cada apresentação atualizada desde o primeiro toque.",
  "One NFC tap opens your live public profile, lets people save your contact, and drives qualified leads into your dashboard. Update once, and every future scan shares your latest info.":
    "Um toque NFC abre seu perfil público ao vivo, permite que as pessoas salvem seu contato e leva leads qualificados ao seu painel. Atualize uma vez e cada novo escaneamento compartilha suas informações mais recentes.",
  "Leads collected": "Leads captados",
  Scans: "Escaneamentos",
  "Conversion rate": "Taxa de conversão",
  "Active Linkets": "Linkets ativos",
  New: "Novo",
  Yesterday: "Ontem",
  "3 days ago": "Há 3 dias",
  "Followed up": "Acompanhado",
  "1 week ago": "Há 1 semana",
  "Interactive networking made seamless": "Networking interativo sem atrito",
  "Linket combines your physical tap-to-share hardware to your live page, keeping your leads organized.":
    "O Linket conecta seu hardware físico de toque para compartilhar à sua página ao vivo, mantendo seus leads organizados.",
  "Instead of handing over a static card, Linket gives you a physical product that opens a living digital introduction. The person you meet can save your contact, open your key links, and get a cleaner sense of what you do in seconds, while you gain insight and keep control of what they see after the conversation.":
    "Em vez de entregar um cartão estático, o Linket oferece um produto físico que abre uma apresentação digital viva. A pessoa que você conhece pode salvar seu contato, abrir seus principais links e entender melhor o que você faz em segundos, enquanto você ganha dados e mantém controle do que ela vê depois da conversa.",
  "A physical tap": "Um toque físico",
  "A live public page": "Uma página pública ao vivo",
  "Follow-up tools behind it": "Ferramentas de acompanhamento por trás",
  "A tap or scan opens your page instantly, so the first handoff feels natural in person without asking anyone to download an app.":
    "Um toque ou escaneamento abre sua página instantaneamente, então a primeira troca parece natural em pessoa sem pedir que alguém baixe um app.",
  "That tap opens a branded page with your photo, headline, contact save, and key links, giving the other person one clear place to understand who you are.":
    "Esse toque abre uma página com sua marca, foto, chamada, opção de salvar contato e links principais, dando à outra pessoa um lugar claro para entender quem você é.",
  "You can update the page anytime, capture leads, and review engagement so every introduction stays current and is easier to follow up on.":
    "Você pode atualizar a página a qualquer momento, captar leads e revisar o engajamento para que cada apresentação continue atual e seja mais fácil de acompanhar.",
  "Public Page": "Página pública",
  "This is the founder's": "Esta é a",
  "live page": "página ao vivo do fundador",
  "A public page is the live profile people see after they tap your Linket or scan your QR code. It gives them one clean place to save your contact, open your key links, and understand who you are in seconds.":
    "Uma página pública é o perfil ao vivo que as pessoas veem depois de tocar no seu Linket ou escanear seu QR code. Ela oferece um lugar claro para salvar seu contato, abrir seus links principais e entender quem você é em segundos.",
  "What Lives Here": "O que fica aqui",
  "Why It Matters": "Por que importa",
  "Your photo, headline, email, contact save button, and important links all stay in one place so the other person knows exactly where to go next.":
    "Sua foto, chamada, e-mail, botão para salvar contato e links importantes ficam em um só lugar para que a outra pessoa saiba exatamente qual é o próximo passo.",
  "Instead of sending people to scattered apps and stale links, every tap opens a current, branded page that feels credible and easy to act on.":
    "Em vez de enviar pessoas para apps dispersos e links desatualizados, cada toque abre uma página atual, com marca, confiável e fácil de usar.",
  "Custom orders": "Pedidos personalizados",
  "Work with us to design custom made Linkets for your":
    "Trabalhe conosco para criar Linkets personalizados para sua",
  team: "equipe",
  "Work directly with our hardware team to design custom models that match your brand. We handle prototyping, sourcing, and rollout so you can stay focused on demos.":
    "Trabalhe diretamente com nossa equipe de hardware para criar modelos personalizados que combinem com sua marca. Cuidamos de prototipagem, fornecimento e implantação para que você foque nas demonstrações.",
  "UV-resistant plastic that holds up to daily wear":
    "Plástico resistente a UV que aguenta o uso diário",
  "Custom models shaped around your logo or brand mark":
    "Modelos personalizados no formato do seu logo ou marca",
  "Customizable public pages that stay on brand":
    "Páginas públicas personalizáveis que mantêm sua marca",
  "Lead capture tools with analytics for follow-ups":
    "Ferramentas de captação de leads com análises para acompanhamento",
  "Get in touch": "Entre em contato",
  "Unlock the full Linket experience with our custom team.":
    "Desbloqueie a experiência completa do Linket com nossa equipe personalizada.",
  "Work email": "E-mail profissional",
  "Team size": "Tamanho da equipe",
  Notes: "Notas",
  "Share timelines or hardware goals...":
    "Compartilhe prazos ou objetivos de hardware...",
  "Book your consult": "Agendar consulta",
  "Request sent": "Solicitação enviada",
  "We will get back to you as soon as possible.":
    "Responderemos o mais rápido possível.",
  "Please enter a valid work email.":
    "Insira um e-mail profissional válido.",
  "Please share your team size.": "Informe o tamanho da sua equipe.",
  "Please add a few notes so we can prepare.":
    "Adicione algumas notas para que possamos nos preparar.",
  "We will reach out within one business day.":
    "Entraremos em contato em até um dia útil.",
  "Something went wrong": "Algo deu errado",
  "Linket plans": "Planos Linket",
  Individual: "Individual",
  Business: "Empresa",
  "Individual options": "Opções individuais",
  "Choose free web-only, paid web-only, or web + Linket bundle.":
    "Escolha web grátis, web paga ou pacote web + Linket.",
  "Business options": "Opções para empresas",
  "Choose standard business Linkets or book a consult to customize a design.":
    "Escolha Linkets empresariais padrão ou agende uma consulta para personalizar um design.",
  "Free Web-Only": "Web grátis",
  "Web + Linket Bundle": "Pacote Web + Linket",
  "Paid Web-Only (Pro)": "Web paga (Pro)",
  "Start free": "Começar grátis",
  "Buy bundle": "Comprar pacote",
  "Start monthly": "Começar mensal",
  "Start yearly": "Começar anual",
  "Contact sales": "Falar com vendas",
  "Book a consult": "Agendar consulta",
  "Answers before you tap": "Respostas antes do toque",
  "Everything you need to know about Linket hardware, profiles, and data.":
    "Tudo que você precisa saber sobre hardware, perfis e dados do Linket.",
  "Does Linket work with both iPhone and Android?":
    "O Linket funciona com iPhone e Android?",
  "Do recipients need a Linket or an app?":
    "Os destinatários precisam de um Linket ou app?",
  "Can I update my profile after printing?":
    "Posso atualizar meu perfil depois de imprimir?",
  "What is the best-value starter option?":
    "Qual opção inicial tem melhor custo-benefício?",
  "Is data collection privacy-centered?":
    "A coleta de dados é centrada em privacidade?",
  "Digital business card": "Cartão de visita digital",
  "NFC business card": "Cartão de visita NFC",
  "Link in bio": "Link na bio",
  "Straight answer": "Resposta direta",
  "Related guides": "Guias relacionados",
  "View pricing": "Ver preços",
  "See the demo": "Ver demonstração",
  "See the profile demo": "Ver demo do perfil",
  "Common questions": "Perguntas comuns",
  "Best fit": "Melhor encaixe",
  "Profile settings": "Configurações do perfil",
  "Active profiles": "Perfis ativos",
  "Setup unavailable": "Configuração indisponível",
  "Choose language": "Escolher idioma",
  "Choose a language to continue.": "Escolha um idioma para continuar.",
  "Loading your setup...": "Carregando sua configuração...",
  "Preparing the fastest path to a live Linket page.":
    "Preparando o caminho mais rápido para uma página Linket ao vivo.",
  Current: "Atual",
  Done: "Concluído",
  Review: "Revisar",
  Next: "Próximo",
  Later: "Depois",
  Profile: "Perfil",
  "Contact card": "Cartão de contato",
  Links: "Links",
  "Review + publish": "Revisar e publicar",
  "Set up your public profile": "Configure seu perfil público",
  "Add the basics now. You can edit everything later.":
    "Adicione o básico agora. Você pode editar tudo depois.",
  "Set up your contact card": "Configure seu cartão de contato",
  "Add the details people save when they download your contact. You can add more later.":
    "Adicione os dados que as pessoas salvam ao baixar seu contato. Você pode adicionar mais depois.",
  "Add your first link": "Adicione seu primeiro link",
  "Add the main link people should open first.":
    "Adicione o link principal que as pessoas devem abrir primeiro.",
  "Review and publish": "Revise e publique",
  "Check your page once, then go live.":
    "Revise sua página uma vez e publique.",
  "Profile photo (optional)": "Foto de perfil (opcional)",
  "Optional for now. Add a photo if you want a stronger first impression.":
    "Opcional por enquanto. Adicione uma foto se quiser uma primeira impressão mais forte.",
  Name: "Nome",
  "What people will see first.": "O que as pessoas verão primeiro.",
  "Public URL": "URL pública",
  "Pick a short link to share. This is the link you'll send.":
    "Escolha um link curto para compartilhar. Esse é o link que você enviará.",
  "Pick your link": "Escolha seu link",
  Unavailable: "Indisponível",
  "Pick a short link": "Escolha um link curto",
  "Checking availability": "Verificando disponibilidade",
  Available: "Disponível",
  "One-line intro": "Introdução em uma linha",
  "Keep it short. You can edit later.":
    "Mantenha curto. Você pode editar depois.",
  "This is what gets saved when someone taps Save contact.":
    "É isso que será salvo quando alguém tocar em Salvar contato.",
  "Start with one detail people can use right away.":
    "Comece com um detalhe que as pessoas possam usar imediatamente.",
  Email: "E-mail",
  "Use account email": "Usar e-mail da conta",
  Optional: "Opcional",
  Phone: "Telefone",
  Hide: "Ocultar",
  "Phone (optional)": "Telefone (opcional)",
  "Business details (optional)": "Dados profissionais (opcional)",
  "Add company or job title if you want it saved too.":
    "Adicione empresa ou cargo se também quiser salvar isso.",
  "Job title": "Cargo",
  Company: "Empresa",
  "First link": "Primeiro link",
  "Second link": "Segundo link",
  "Link label": "Rótulo do link",
  URL: "URL",
  "Add custom label": "Adicionar rótulo personalizado",
  "We'll name the button from the link.":
    "Nomearemos o botão a partir do link.",
  "Add another link": "Adicionar outro link",
  Theme: "Tema",
  "Pick a theme. You can change it later.":
    "Escolha um tema. Você pode mudar depois.",
  "Free includes Light and Dark. Paid unlocks the full theme library.":
    "O grátis inclui Claro e Escuro. O pago desbloqueia toda a biblioteca de temas.",
  "Paid themes": "Temas pagos",
  "Unlock paid themes": "Desbloquear temas pagos",
  Paid: "Pago",
  "Add your first link first.": "Adicione seu primeiro link primeiro.",
  "Your public URL": "Sua URL pública",
  Copy: "Copiar",
  Edit: "Editar",
  "Ready to publish": "Pronto para publicar",
  "Make sure the essentials are in place before you go live.":
    "Garanta que o essencial esteja pronto antes de publicar.",
  "Before you publish": "Antes de publicar",
  "After you publish": "Depois de publicar",
  "Check the preview once.": "Confira a prévia uma vez.",
  "Make sure your first link opens correctly.":
    "Confira se seu primeiro link abre corretamente.",
  "Review how the page looks on mobile.":
    "Veja como a página aparece no celular.",
  "Your page goes live at this URL.":
    "Sua página entra no ar nesta URL.",
  "Your QR becomes available.": "Seu QR fica disponível.",
  "You can still edit the page anytime.":
    "Você ainda pode editar a página quando quiser.",
  Back: "Voltar",
  "Continue to contact info": "Continuar para dados de contato",
  "Continue to links": "Continuar para links",
  "Continue to review": "Continuar para revisão",
  "Publishing...": "Publicando...",
  "Update live page": "Atualizar página ao vivo",
  "Publish page": "Publicar página",
  "Live preview": "Prévia ao vivo",
  "This updates as you type.": "Isso atualiza enquanto você digita.",
  "To finish setup": "Para terminar a configuração",
  Status: "Status",
  "Live status": "Status ao vivo",
  "Next step: continue to the dashboard.":
    "Próximo passo: continue para o painel.",
  "You're live": "Você está ao vivo",
  "Your page is live. Next, continue to the dashboard.":
    "Sua página está ao vivo. Agora continue para o painel.",
  "Your live link": "Seu link ao vivo",
  "Next step": "Próximo passo",
  "Continue to dashboard": "Continuar para o painel",
  "Share your page": "Compartilhe sua página",
  "Copy link": "Copiar link",
  "Open live page": "Abrir página ao vivo",
  "Show QR": "Mostrar QR",
  "Keep building": "Continuar construindo",
  "Pair your Linket": "Parear seu Linket",
  "Connect your device next.": "Conecte seu dispositivo em seguida.",
  "Set up lead capture": "Configurar captação de leads",
  "Open the lead form builder.": "Abrir o construtor de formulário.",
  "Share this QR": "Compartilhe este QR",
  "Scan this on a phone to test your live page or use it in person.":
    "Escaneie no celular para testar sua página ao vivo ou usar pessoalmente.",
};

export const TRANSLATIONS: Record<SupportedLocale, LocaleDictionary> = {
  en: {
    code: "en",
    htmlLang: "en",
    ui: {
      languageSwitcher: {
        ariaLabel: "Change language",
        label: "Language",
      },
      onboarding: {
        stepPrefix: "Step",
        stepOf: "of",
        language: {
          stepLabel: "Language",
          stepDescription: "Choose how to continue",
          pageTitle: "Choose your language",
          pageDescription:
            "Start setup in the language you prefer. We guessed from your region and browser, and you can change it anytime.",
          cardTitle: "Which language do you want to use?",
          cardDescription:
            "This choice updates the website and onboarding experience on this device.",
          helper:
            "Your selection is saved for future visits and can be changed from the language control.",
          continuePrefix: "Continue in",
          selectedBadge: "Selected",
          detectedBadge: "Detected",
          options: {
            en: {
              title: "English",
              description: "Continue through setup in English.",
            },
            es: {
              title: "Español",
              description: "Continúa la configuración en español.",
            },
            pt: {
              title: "Português",
              description: "Continue a configuração em português.",
            },
          },
        },
      },
    },
    phrases: {},
  },
  es: {
    code: "es",
    htmlLang: "es",
    ui: {
      languageSwitcher: {
        ariaLabel: "Cambiar idioma",
        label: "Idioma",
      },
      onboarding: {
        stepPrefix: "Paso",
        stepOf: "de",
        language: {
          stepLabel: "Idioma",
          stepDescription: "Elige cómo continuar",
          pageTitle: "Elige tu idioma",
          pageDescription:
            "Inicia la configuración en el idioma que prefieras. Lo estimamos por tu región y navegador, y puedes cambiarlo cuando quieras.",
          cardTitle: "¿En qué idioma quieres continuar?",
          cardDescription:
            "Esta elección actualiza el sitio web y la experiencia de onboarding en este dispositivo.",
          helper:
            "Tu selección se guarda para futuras visitas y puede cambiarse desde el control de idioma.",
          continuePrefix: "Continuar en",
          selectedBadge: "Seleccionado",
          detectedBadge: "Detectado",
          options: {
            en: {
              title: "English",
              description: "Continue through setup in English.",
            },
            es: {
              title: "Español",
              description: "Continúa la configuración en español.",
            },
            pt: {
              title: "Português",
              description: "Continue a configuração em português.",
            },
          },
        },
      },
    },
    phrases: esPhrases,
  },
  pt: {
    code: "pt",
    htmlLang: "pt",
    ui: {
      languageSwitcher: {
        ariaLabel: "Alterar idioma",
        label: "Idioma",
      },
      onboarding: {
        stepPrefix: "Etapa",
        stepOf: "de",
        language: {
          stepLabel: "Idioma",
          stepDescription: "Escolha como continuar",
          pageTitle: "Escolha seu idioma",
          pageDescription:
            "Comece a configuração no idioma que preferir. Estimamos pela sua região e navegador, e você pode alterar quando quiser.",
          cardTitle: "Em qual idioma você quer continuar?",
          cardDescription:
            "Essa escolha atualiza o site e a experiência de onboarding neste dispositivo.",
          helper:
            "Sua seleção fica salva para visitas futuras e pode ser alterada no controle de idioma.",
          continuePrefix: "Continuar em",
          selectedBadge: "Selecionado",
          detectedBadge: "Detectado",
          options: {
            en: {
              title: "English",
              description: "Continue through setup in English.",
            },
            es: {
              title: "Español",
              description: "Continúa la configuración en español.",
            },
            pt: {
              title: "Português",
              description: "Continue a configuração em português.",
            },
          },
        },
      },
    },
    phrases: ptPhrases,
  },
};

export function normalizeLocale(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace("_", "-");
  const base = normalized.split("-")[0] as SupportedLocale;
  return SUPPORTED_LOCALES.includes(base) ? base : null;
}

export function getLocaleOption(locale: SupportedLocale) {
  return (
    LOCALE_OPTIONS.find((option) => option.code === locale) ??
    LOCALE_OPTIONS[0]
  );
}

export function getHtmlLang(locale: SupportedLocale) {
  return TRANSLATIONS[locale]?.htmlLang ?? TRANSLATIONS.en.htmlLang;
}

export function getLocaleFromCountry(country: string | null | undefined) {
  const normalized = country?.trim().toUpperCase();
  if (!normalized) return null;
  if (PORTUGUESE_COUNTRIES.has(normalized)) return "pt";
  if (SPANISH_COUNTRIES.has(normalized)) return "es";
  return null;
}

export function getLocaleFromAcceptLanguage(
  acceptLanguage: string | null | undefined
) {
  if (!acceptLanguage) return null;

  const candidates = acceptLanguage
    .split(",")
    .map((entry) => {
      const [tag = "", qValue = "q=1"] = entry.trim().split(";");
      const q = Number(qValue.replace(/^q=/i, ""));
      return {
        locale: normalizeLocale(tag),
        q: Number.isFinite(q) ? q : 1,
      };
    })
    .filter((entry): entry is { locale: SupportedLocale; q: number } =>
      Boolean(entry.locale)
    )
    .sort((a, b) => b.q - a.q);

  return candidates[0]?.locale ?? null;
}

export function resolveDetectedLocale(input: {
  cookieLocale?: string | null;
  queryLocale?: string | null;
  country?: string | null;
  acceptLanguage?: string | null;
}) {
  return (
    normalizeLocale(input.queryLocale) ??
    normalizeLocale(input.cookieLocale) ??
    getLocaleFromCountry(input.country) ??
    getLocaleFromAcceptLanguage(input.acceptLanguage) ??
    DEFAULT_LOCALE
  );
}

export function translatePhrase(locale: SupportedLocale, text: string) {
  if (locale === "en") return text;
  const normalized = text.trim().replace(/\s+/g, " ");
  return TRANSLATIONS[locale]?.phrases[normalized] ?? text;
}

export function persistLocalePreference(
  locale: SupportedLocale,
  source: LocaleSource = "manual"
) {
  if (typeof document === "undefined") return;
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; path=/; max-age=${maxAge}; samesite=lax`;
  document.cookie = `${LOCALE_SOURCE_COOKIE_NAME}=${source}; path=/; max-age=${maxAge}; samesite=lax`;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Storage is optional; the cookie is enough for server rendering.
  }
}
