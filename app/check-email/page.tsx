export default function CheckEmailPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Check Your Email
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            We&apos;ve sent you a confirmation email
          </p>
        </div>

        <div className="rounded-md bg-blue-50 p-4">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">
                Email Confirmation Required
              </h3>
              <div className="mt-2 text-sm text-blue-700">
                <p>
                  We&apos;ve sent you a confirmation email. Please click the link in the email
                  to verify your account.
                </p>
                <p className="mt-2">
                  After confirming, you can sign in to access the application.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center">
          <a
            href="/login"
            className="font-medium text-indigo-600 hover:text-indigo-500"
          >
            Back to Sign In
          </a>
        </div>

        <div className="text-center">
          <p className="text-xs text-gray-500">
            Didn&apos;t receive an email? Check your spam folder or contact support.
          </p>
        </div>
      </div>
    </div>
  );
}
