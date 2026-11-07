"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card alert alert-on">
      <div className="big">Не получилось</div>
      <p>
        {process.env.NODE_ENV === "production"
          ? "Проверьте, что всё заполнено правильно (сумма, направление, 4 цифры карты), и попробуйте ещё раз."
          : error.message}
      </p>
      <button className="btn" onClick={reset}>
        Попробовать ещё раз
      </button>
    </div>
  );
}
