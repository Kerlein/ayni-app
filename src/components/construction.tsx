import Link from "next/link";
import { ArrowRight, LockKeyhole, Users, Check } from "lucide-react";
export function Construction({
  module,
  preview = false,
}: {
  module?: string;
  preview?: boolean;
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">
            {module ? "PRÓXIMAMENTE" : "TU ESPACIO, TUS POSIBILIDADES"}
          </span>
          <h1>{module || "Un nuevo comienzo."}</h1>
          <p>
            {module
              ? "Este módulo estará disponible en una próxima etapa."
              : "Bienvenido a AYNI. Estamos construyendo lo que viene."}
          </p>
        </div>
        <span className="stage-badge">
          <span /> Etapa inicial
        </span>
      </div>
      <section className="construction-card">
        <div className="construction-art">
          <span className="image-caption">PASO A PASO, JUNTOS</span>
          <img
            src="/en-construccion.png"
            width={800}
            height={800}
            alt="Cartel con herramientas que indica que el espacio está en construcción"
          />
          <span className="art-footnote">
            Cada gran historia tiene un comienzo.
          </span>
        </div>
        <div className="construction-copy">
          <span className="construction-pill">ESPACIO EN CONSTRUCCIÓN</span>
          <h2>
            Estamos preparando
            <br />
            tu próximo <span>paso.</span>
          </h2>
          <p>
            {module
              ? "Estamos trabajando para que pronto puedas usar " +
                module.toLowerCase() +
                "."
              : "Muy pronto podrás gestionar tus compras, pagos y financiamiento desde un mismo lugar."}
          </p>
          <div className="available-box">
            <span className="available-icon">
              <Users size={23} />
            </span>
            <div>
              <strong>Tu cuenta ya tiene su espacio</strong>
              <p>Consulta tu perfil y mantén tus datos actualizados.</p>
            </div>
            <Check size={18} />
          </div>
          <Link
            className="button primary"
            href={preview ? "/login" : "/app/perfil"}
          >
            {preview ? "Iniciar sesión" : "Ir a mi perfil"}
            <ArrowRight size={18} />
          </Link>
          <div className="construction-security">
            <LockKeyhole size={14} />
            Las opciones disponibles dependen de tu rol.
          </div>
        </div>
      </section>
      <div className="below-construction">
        <span className="green-line" />
        <p>
          <strong>Avanzamos contigo.</strong> Un módulo a la vez, nuevas
          posibilidades por delante.
        </p>
        <span className="version-label">AYNI · v1.0</span>
      </div>
    </>
  );
}
