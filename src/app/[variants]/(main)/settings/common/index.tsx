import Appearance from './features/Appearance';
import Common from './features/Common/Common';

const Page = () => {
  return (
    <>
      <Common />
      <Appearance />
    </>
  );
};

Page.displayName = 'CommonSetting';

export default Page;
