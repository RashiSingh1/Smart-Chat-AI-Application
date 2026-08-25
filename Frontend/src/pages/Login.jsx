import LoginCard from "../components/LoginCard";

import background from "../assets/login.gif";

function Login() {

  return (

    <div className="page">

      <img

        src={background}

        alt="background"

        className="background"

      />

      <div className="overlay"></div>

      <LoginCard />

    </div>

  );

}
export default Login;