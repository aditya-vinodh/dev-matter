import * as React from "react";

interface VerificationEmailProps {
  email: string;
  code: string;
}

export const VerificationEmail: React.FC<Readonly<VerificationEmailProps>> = ({
  email,
  code,
}) => (
  <div>
    <h1>
      Please use the code {code} to verify your email {email} on DevMatter
    </h1>
  </div>
);
